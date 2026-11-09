import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AUDIT_ACTIONS, AUDIT_OUTCOMES, type AuditAction, type AuditEvent, type AuditOutcome } from './audit.js';
import type { AuditPageKey, AuditQuery, AuditReader } from './reader.js';

/** '~' es mayor que cualquier carácter de un UUID: `to#~` incluye todos los eventos de ese instante. */
const SK_UPPER_SUFFIX = '#~';

function isAction(value: unknown): value is AuditAction {
  return (AUDIT_ACTIONS as readonly unknown[]).includes(value);
}

function isOutcome(value: unknown): value is AuditOutcome {
  return (AUDIT_OUTCOMES as readonly unknown[]).includes(value);
}

/** Devuelve solo los campos del contrato (CA-10.2): no expone `eventType` ni `sk`. */
function toAuditEvent(item: Record<string, unknown>): AuditEvent {
  const { eventId, timestamp, requestId, actorRef, action, resourceRef, outcome } = item;
  if (
    typeof eventId !== 'string' ||
    typeof timestamp !== 'string' ||
    typeof requestId !== 'string' ||
    typeof actorRef !== 'string' ||
    !isAction(action) ||
    typeof resourceRef !== 'string' ||
    !isOutcome(outcome)
  ) {
    throw new Error('Evento de auditoría corrupto');
  }
  return { eventId, timestamp, requestId, actorRef, action, resourceRef, outcome };
}

export function buildKeyCondition(query: AuditQuery): {
  expression: string;
  values: Record<string, string>;
} {
  const values: Record<string, string> = { ':type': query.eventType };
  let expression = 'eventType = :type';
  if (query.from !== undefined && query.to !== undefined) {
    expression += ' AND sk BETWEEN :from AND :to';
    values[':from'] = query.from;
    values[':to'] = `${query.to}${SK_UPPER_SUFFIX}`;
  } else if (query.from !== undefined) {
    expression += ' AND sk >= :from';
    values[':from'] = query.from;
  } else if (query.to !== undefined) {
    expression += ' AND sk <= :to';
    values[':to'] = `${query.to}${SK_UPPER_SUFFIX}`;
  }
  return { expression, values };
}

export function createDynamoAuditReader(client: DynamoDBDocumentClient, auditTable: string): AuditReader {
  return {
    async query(query) {
      const { expression, values } = buildKeyCondition(query);
      const result = await client.send(
        new QueryCommand({
          TableName: auditTable,
          KeyConditionExpression: expression,
          ExpressionAttributeValues: values,
          ScanIndexForward: false,
          Limit: query.limit,
          ExclusiveStartKey: query.startKey,
        }),
      );
      const last = result.LastEvaluatedKey;
      const nextKey: AuditPageKey | undefined =
        last !== undefined && typeof last['eventType'] === 'string' && typeof last['sk'] === 'string'
          ? { eventType: last['eventType'], sk: last['sk'] }
          : undefined;
      return { items: (result.Items ?? []).map(toAuditEvent), nextKey };
    },
  };
}
