import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AuditLog } from '../audit/audit.js';
import { createDynamoAuditLog } from '../audit/dynamo-audit-log.js';
import { createDynamoProjectRepository } from './dynamo-repository.js';
import { makeProjectHandlers } from './handlers.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

/** Las funciones de solo lectura no reciben la tabla de auditoría (mínimo privilegio, CA-NF03.1). */
const readOnlyAudit: AuditLog = {
  record() {
    return Promise.reject(new Error('Función de solo lectura: no escribe auditoría'));
  },
};

/**
 * Conecta los handlers con DynamoDB usando las tablas de la plantilla SAM.
 * - Lectura (list, get, stats): solo usa TABLE_PROJECTS.
 * - Escritura (create, publish): TABLE_PROJECTS y TABLE_AUDIT.
 */
export function createProjectHandlersFromEnv(options: { writes: boolean }) {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const projectsTable = requireEnv('TABLE_PROJECTS');
  const auditTable = options.writes ? requireEnv('TABLE_AUDIT') : undefined;
  return makeProjectHandlers({
    projects: createDynamoProjectRepository({ client, projectsTable, auditTable }),
    audit: auditTable === undefined ? readOnlyAudit : createDynamoAuditLog(client, auditTable),
  });
}
