import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, QueryCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { toAuditItem } from '../audit/dynamo-audit-log.js';
import { AppError } from '../shared/errors.js';
import { DonationSchema, ProjectSchema, type Donation, type Project } from '../shared/schemas.js';
import type { IdempotencyRecord } from './idempotency.js';
import type { CreateDonationResult, CreateDonationWrite, DonationRepository } from './repository.js';

/** GSI del historial (design.md §5): PK `donorSub`, SK `createdAt`. */
export const DONATIONS_DONOR_INDEX = 'donorSub-createdAt';

/** Cada función recibe solo las tablas que usa (mínimo privilegio, CA-NF03.1). */
export interface DynamoDonationRepositoryConfig {
  client: DynamoDBDocumentClient;
  donationsTable: string;
  idempotencyTable?: string | undefined;
  projectsTable?: string | undefined;
  auditTable?: string | undefined;
}

// Orden de los elementos de la transacción: CancellationReasons llega en el mismo orden.
const TX_IDEMPOTENCY = 0;
const TX_PROJECT_CHECK = 2;

function required(value: string | undefined, name: string): string {
  if (value === undefined) {
    throw new Error(`${name} no configurada para esta función`);
  }
  return value;
}

function toIdempotencyRecord(item: Record<string, unknown>): IdempotencyRecord {
  const { pk, payloadHash, donationId, responseStatus, responseBody, expiresAt, createdAt } = item;
  if (
    typeof pk !== 'string' ||
    typeof payloadHash !== 'string' ||
    typeof donationId !== 'string' ||
    typeof responseStatus !== 'number' ||
    typeof responseBody !== 'string' ||
    typeof expiresAt !== 'number' ||
    typeof createdAt !== 'string'
  ) {
    throw new Error('Registro de idempotencia corrupto');
  }
  return { pk, payloadHash, donationId, responseStatus, responseBody, expiresAt, createdAt };
}

export function createDynamoDonationRepository(config: DynamoDonationRepositoryConfig): DonationRepository {
  const { client, donationsTable } = config;
  const idempotencyTable = () => required(config.idempotencyTable, 'TABLE_IDEMPOTENCY');
  const projectsTable = () => required(config.projectsTable, 'TABLE_PROJECTS');
  const auditTable = () => required(config.auditTable, 'TABLE_AUDIT');

  return {
    async getIdempotencyRecord(pk: string) {
      const result = await client.send(
        new GetCommand({ TableName: idempotencyTable(), Key: { pk }, ConsistentRead: true }),
      );
      if (!result.Item) {
        return undefined;
      }
      const record = toIdempotencyRecord(result.Item);
      // El TTL de DynamoDB borra con retraso: una clave vencida se trata como inexistente.
      return record.expiresAt > Math.floor(Date.now() / 1000) ? record : undefined;
    },

    async getProject(projectId: string): Promise<Project | undefined> {
      const result = await client.send(
        new GetCommand({ TableName: projectsTable(), Key: { projectId }, ConsistentRead: true }),
      );
      return result.Item ? ProjectSchema.parse(result.Item) : undefined;
    },

    async createDonation({ record, donation, audit }: CreateDonationWrite): Promise<CreateDonationResult> {
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                // La clave solo se puede reservar una vez (CA-05.4). Si ya existe y venció, se reemplaza.
                Put: {
                  TableName: idempotencyTable(),
                  Item: record,
                  ConditionExpression: 'attribute_not_exists(pk) OR expiresAt < :now',
                  ExpressionAttributeValues: { ':now': Math.floor(Date.now() / 1000) },
                },
              },
              {
                Put: {
                  TableName: donationsTable,
                  Item: donation,
                  ConditionExpression: 'attribute_not_exists(donationId)',
                },
              },
              {
                // El proyecto sigue PUBLICADO en el mismo instante de la escritura.
                ConditionCheck: {
                  TableName: projectsTable(),
                  Key: { projectId: donation.projectId },
                  ConditionExpression: '#status = :published',
                  ExpressionAttributeNames: { '#status': 'status' },
                  ExpressionAttributeValues: { ':published': 'PUBLICADO' },
                },
              },
              { Put: { TableName: auditTable(), Item: toAuditItem(audit) } },
            ],
          }),
        );
        return 'CREATED';
      } catch (error) {
        if (error instanceof TransactionCanceledException) {
          const reasons = error.CancellationReasons ?? [];
          if (reasons[TX_IDEMPOTENCY]?.Code === 'ConditionalCheckFailed') {
            return 'KEY_EXISTS';
          }
          if (reasons[TX_PROJECT_CHECK]?.Code === 'ConditionalCheckFailed') {
            throw new AppError('CONFLICT', 'El proyecto no acepta donaciones');
          }
          if (reasons.some((reason) => reason.Code === 'TransactionConflict')) {
            throw new AppError('CONFLICT', 'Solicitud concurrente, reintente');
          }
        }
        if (error instanceof Error && error.name === 'TransactionConflictException') {
          throw new AppError('CONFLICT', 'Solicitud concurrente, reintente');
        }
        throw error;
      }
    },

    async listByDonor(donorSub: string) {
      const donations: Donation[] = [];
      let exclusiveStartKey: Record<string, unknown> | undefined;
      do {
        const page = await client.send(
          new QueryCommand({
            TableName: donationsTable,
            IndexName: DONATIONS_DONOR_INDEX,
            KeyConditionExpression: 'donorSub = :sub',
            ExpressionAttributeValues: { ':sub': donorSub },
            ScanIndexForward: false,
            ExclusiveStartKey: exclusiveStartKey,
          }),
        );
        for (const item of page.Items ?? []) {
          donations.push(DonationSchema.parse(item));
        }
        exclusiveStartKey = page.LastEvaluatedKey;
      } while (exclusiveStartKey !== undefined);
      return donations;
    },

    async getDonation(donationId: string) {
      const result = await client.send(
        new GetCommand({ TableName: donationsTable, Key: { donationId }, ConsistentRead: true }),
      );
      return result.Item ? DonationSchema.parse(result.Item) : undefined;
    },
  };
}
