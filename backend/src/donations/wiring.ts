import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AuditLog } from '../audit/audit.js';
import { createDynamoAuditLog } from '../audit/dynamo-audit-log.js';
import { createDynamoDonationRepository } from './dynamo-repository.js';
import { makeDonationHandlers } from './handlers.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

const readOnlyAudit: AuditLog = {
  record() {
    return Promise.reject(new Error('Función de solo lectura: no escribe auditoría'));
  },
};

/**
 * Conecta los handlers con DynamoDB usando las tablas de la plantilla SAM.
 * - Lectura (listMine, get): solo TABLE_DONATIONS.
 * - Creación: TABLE_DONATIONS, TABLE_IDEMPOTENCY, TABLE_PROJECTS y TABLE_AUDIT.
 */
export function createDonationHandlersFromEnv(options: { writes: boolean }) {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const donationsTable = requireEnv('TABLE_DONATIONS');
  if (!options.writes) {
    return makeDonationHandlers({
      donations: createDynamoDonationRepository({ client, donationsTable }),
      audit: readOnlyAudit,
    });
  }
  const auditTable = requireEnv('TABLE_AUDIT');
  return makeDonationHandlers({
    donations: createDynamoDonationRepository({
      client,
      donationsTable,
      idempotencyTable: requireEnv('TABLE_IDEMPOTENCY'),
      projectsTable: requireEnv('TABLE_PROJECTS'),
      auditTable,
    }),
    audit: createDynamoAuditLog(client, auditTable),
  });
}
