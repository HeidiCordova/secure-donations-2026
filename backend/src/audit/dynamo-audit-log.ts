import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AuditEvent, AuditLog } from './audit.js';

/** Tabla AuditEvents (design.md §5): PK `eventType`, SK `sk` = `timestamp#eventId` (filtros por tipo y fecha). */
export function toAuditItem(event: AuditEvent): Record<string, unknown> {
  return { eventType: event.action, sk: `${event.timestamp}#${event.eventId}`, ...event };
}

export function createDynamoAuditLog(client: DynamoDBDocumentClient, auditTable: string): AuditLog {
  return {
    async record(event) {
      await client.send(new PutCommand({ TableName: auditTable, Item: toAuditItem(event) }));
    },
  };
}
