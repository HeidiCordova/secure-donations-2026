import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, QueryCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AuditEvent } from '../audit/audit.js';
import { toAuditItem } from '../audit/dynamo-audit-log.js';
import { AppError } from '../shared/errors.js';
import { ProjectSchema, type Project } from '../shared/schemas.js';
import type { ProjectRepository } from './repository.js';

/** GSI del catálogo (design.md §5): PK `status`, SK `createdAt`. */
export const PROJECTS_STATUS_INDEX = 'status-createdAt';

export interface DynamoProjectRepositoryConfig {
  client: DynamoDBDocumentClient;
  projectsTable: string;
  /** Solo lo necesitan las funciones de escritura (crear y publicar). */
  auditTable?: string | undefined;
}

/** Valida lo que sale de la base: un registro corrupto produce 500, no datos mal formados. */
function toProject(item: Record<string, unknown>): Project {
  return ProjectSchema.parse(item);
}

function isConditionFailure(error: unknown): boolean {
  return (
    error instanceof TransactionCanceledException &&
    (error.CancellationReasons ?? []).some((reason) => reason.Code === 'ConditionalCheckFailed')
  );
}

export function createDynamoProjectRepository(config: DynamoProjectRepositoryConfig): ProjectRepository {
  const { client, projectsTable } = config;

  function auditTable(): string {
    if (config.auditTable === undefined) {
      throw new Error('AUDIT_TABLE no configurada para esta función');
    }
    return config.auditTable;
  }

  async function get(projectId: string): Promise<Project | undefined> {
    const result = await client.send(
      new GetCommand({ TableName: projectsTable, Key: { projectId }, ConsistentRead: true }),
    );
    return result.Item ? toProject(result.Item) : undefined;
  }

  return {
    async listPublished() {
      const projects: Project[] = [];
      let exclusiveStartKey: Record<string, unknown> | undefined;
      do {
        const page = await client.send(
          new QueryCommand({
            TableName: projectsTable,
            IndexName: PROJECTS_STATUS_INDEX,
            KeyConditionExpression: '#status = :published',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':published': 'PUBLICADO' },
            ScanIndexForward: false,
            ExclusiveStartKey: exclusiveStartKey,
          }),
        );
        for (const item of page.Items ?? []) {
          projects.push(toProject(item));
        }
        exclusiveStartKey = page.LastEvaluatedKey;
      } while (exclusiveStartKey !== undefined);
      return projects;
    },

    get,

    async create(project: Project, audit: AuditEvent) {
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: projectsTable,
                  Item: project,
                  ConditionExpression: 'attribute_not_exists(projectId)',
                },
              },
              { Put: { TableName: auditTable(), Item: toAuditItem(audit) } },
            ],
          }),
        );
      } catch (error) {
        if (isConditionFailure(error)) {
          throw new AppError('CONFLICT', 'El recurso ya existe');
        }
        throw error;
      }
    },

    async publish(projectId: string, updatedAt: string, audit: AuditEvent) {
      const current = await get(projectId);
      if (current === undefined) {
        throw new AppError('NOT_FOUND', 'Recurso no encontrado');
      }
      if (current.status !== 'BORRADOR') {
        throw new AppError('CONFLICT', 'El proyecto ya está publicado');
      }
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: projectsTable,
                  Key: { projectId },
                  // La condición evita que dos publicaciones concurrentes tengan éxito.
                  ConditionExpression: 'attribute_exists(projectId) AND #status = :draft',
                  UpdateExpression: 'SET #status = :published, updatedAt = :updatedAt',
                  ExpressionAttributeNames: { '#status': 'status' },
                  ExpressionAttributeValues: {
                    ':draft': 'BORRADOR',
                    ':published': 'PUBLICADO',
                    ':updatedAt': updatedAt,
                  },
                },
              },
              { Put: { TableName: auditTable(), Item: toAuditItem(audit) } },
            ],
          }),
        );
      } catch (error) {
        if (isConditionFailure(error)) {
          throw new AppError('CONFLICT', 'El proyecto ya está publicado');
        }
        throw error;
      }
      return { ...current, status: 'PUBLICADO', updatedAt };
    },
  };
}
