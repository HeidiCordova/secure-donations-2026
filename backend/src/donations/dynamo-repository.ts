import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { toAuditItem } from '../audit/dynamo-audit-log.js';
import { AppError } from '../shared/errors.js';
import { DonationSchema, ProjectSchema, type Donation, type Project } from '../shared/schemas.js';
import type { IdempotencyRecord } from './idempotency.js';
import type {
  CreateDonationResult,
  CreateDonationWrite,
  DonationRepository,
  SimulateDonationWrite,
} from './repository.js';

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
const TX_SIMULATE_DONATION = 0;
const TX_SIMULATE_PROJECT = 1;

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

  /** Consulta paginada del GSI donorSub-createdAt, más recientes primero. */
  async function queryByDonor(
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, string>,
  ): Promise<Donation[]> {
    const donations: Donation[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const page = await client.send(
        new QueryCommand({
          TableName: donationsTable,
          IndexName: DONATIONS_DONOR_INDEX,
          KeyConditionExpression: keyConditionExpression,
          ExpressionAttributeValues: expressionAttributeValues,
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
  }

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

    listByDonor(donorSub: string) {
      return queryByDonor('donorSub = :sub', { ':sub': donorSub });
    },

    /** Ventana de tiempo sobre el sort key del GSI: createdAt es ISO 8601, así que comparar texto es comparar fechas. */
    listByDonorSince(donorSub: string, sinceIso: string) {
      return queryByDonor('donorSub = :sub AND createdAt >= :since', { ':sub': donorSub, ':since': sinceIso });
    },

    async simulateDonation({ donation, outcome, updatedAt, audit }: SimulateDonationWrite): Promise<Donation> {
      const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [
        {
          // Solo la primera transición desde PENDIENTE_SIMULACION tiene éxito (CA-06.2).
          Update: {
            TableName: donationsTable,
            Key: { donationId: donation.donationId },
            ConditionExpression: '#status = :pending AND donorSub = :sub',
            UpdateExpression: 'SET #status = :outcome, updatedAt = :updatedAt',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':pending': 'PENDIENTE_SIMULACION',
              ':sub': donation.donorSub,
              ':outcome': outcome,
              ':updatedAt': updatedAt,
            },
          },
        },
      ];
      if (outcome === 'CONFIRMADA_SIMULADA') {
        // ADD es atómico; al ir en la misma transacción, el total sube una sola vez (RNF-HU-04).
        items.push({
          Update: {
            TableName: projectsTable(),
            Key: { projectId: donation.projectId },
            ConditionExpression: 'attribute_exists(projectId)',
            UpdateExpression: 'ADD confirmedAmountCents :amount SET updatedAt = :updatedAt',
            ExpressionAttributeValues: { ':amount': donation.amountCents, ':updatedAt': updatedAt },
          },
        });
      }
      items.push({ Put: { TableName: auditTable(), Item: toAuditItem(audit) } });

      try {
        await client.send(new TransactWriteCommand({ TransactItems: items }));
      } catch (error) {
        if (error instanceof TransactionCanceledException) {
          const reasons = error.CancellationReasons ?? [];
          if (reasons[TX_SIMULATE_DONATION]?.Code === 'ConditionalCheckFailed') {
            throw new AppError('INVALID_TRANSITION', 'La donación ya no está pendiente');
          }
          if (outcome === 'CONFIRMADA_SIMULADA' && reasons[TX_SIMULATE_PROJECT]?.Code === 'ConditionalCheckFailed') {
            throw new AppError('NOT_FOUND', 'Recurso no encontrado');
          }
          if (reasons.some((reason) => reason.Code === 'TransactionConflict')) {
            // Otra confirmación de la misma donación se está aplicando: esta no suma nada.
            throw new AppError('INVALID_TRANSITION', 'La donación ya no está pendiente');
          }
        }
        if (error instanceof Error && error.name === 'TransactionConflictException') {
          throw new AppError('INVALID_TRANSITION', 'La donación ya no está pendiente');
        }
        throw error;
      }
      return { ...donation, status: outcome, updatedAt };
    },

    async getDonation(donationId: string) {
      const result = await client.send(
        new GetCommand({ TableName: donationsTable, Key: { donationId }, ConsistentRead: true }),
      );
      return result.Item ? DonationSchema.parse(result.Item) : undefined;
    },
  };
}
