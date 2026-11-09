import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createDynamoAuditReader } from './dynamo-audit-reader.js';
import { makeAuditHandlers } from './handlers.js';

/** La función de auditoría solo lee TABLE_AUDIT (mínimo privilegio, CA-NF03.1). */
export function createAuditHandlersFromEnv() {
  const auditTable = process.env['TABLE_AUDIT'];
  if (auditTable === undefined || auditTable === '') {
    throw new Error('Falta la variable de entorno TABLE_AUDIT');
  }
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return makeAuditHandlers({ reader: createDynamoAuditReader(client, auditTable) });
}
