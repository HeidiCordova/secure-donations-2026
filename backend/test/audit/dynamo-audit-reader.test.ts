import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import { buildKeyCondition, createDynamoAuditReader } from '../../src/audit/dynamo-audit-reader.js';

const item = {
  eventType: 'PROJECT_CREATE',
  sk: '2026-11-08T13:10:29.631Z#e1',
  eventId: 'e1',
  timestamp: '2026-11-08T13:10:29.631Z',
  requestId: 'req-x',
  actorRef: 'actor_c9041b20fb5c7865',
  action: 'PROJECT_CREATE',
  resourceRef: 'project:abc',
  outcome: 'SUCCESS',
};

function fakeClient(responses: unknown[]) {
  const sent: unknown[] = [];
  const client = {
    send(command: unknown) {
      sent.push(command);
      return Promise.resolve(responses.shift() ?? {});
    },
  } as unknown as DynamoDBDocumentClient;
  return { client, sent };
}

describe('buildKeyCondition', () => {
  it('sin fechas: solo el tipo', () => {
    expect(buildKeyCondition({ eventType: 'PROJECT_CREATE', limit: 50 })).toEqual({
      expression: 'eventType = :type',
      values: { ':type': 'PROJECT_CREATE' },
    });
  });

  it('con rango: BETWEEN, y el límite superior incluye todo ese instante', () => {
    const { expression, values } = buildKeyCondition({
      eventType: 'PROJECT_CREATE',
      from: '2026-11-08T00:00:00.000Z',
      to: '2026-11-08T23:59:59.999Z',
      limit: 50,
    });
    expect(expression).toBe('eventType = :type AND sk BETWEEN :from AND :to');
    expect(values[':to']).toBe('2026-11-08T23:59:59.999Z#~');
    expect('2026-11-08T23:59:59.999Z#ffffffff-ffff' < (values[':to'] ?? '')).toBe(true);
  });

  it('solo from usa >= y solo to usa <=', () => {
    expect(buildKeyCondition({ eventType: 'PROJECT_CREATE', from: 'a', limit: 1 }).expression).toContain('sk >= :from');
    expect(buildKeyCondition({ eventType: 'PROJECT_CREATE', to: 'b', limit: 1 }).expression).toContain('sk <= :to');
  });
});

describe('createDynamoAuditReader', () => {
  it('consulta la tabla por tipo, más recientes primero, con límite y página', async () => {
    const { client, sent } = fakeClient([
      { Items: [item], LastEvaluatedKey: { eventType: 'PROJECT_CREATE', sk: item.sk } },
    ]);
    const reader = createDynamoAuditReader(client, 'AuditEvents');
    const page = await reader.query({ eventType: 'PROJECT_CREATE', limit: 10 });
    const query = sent[0] as QueryCommand;
    expect(query).toBeInstanceOf(QueryCommand);
    expect(query.input).toMatchObject({ TableName: 'AuditEvents', ScanIndexForward: false, Limit: 10 });
    expect(page.nextKey).toEqual({ eventType: 'PROJECT_CREATE', sk: item.sk });
    expect(page.items[0]).not.toHaveProperty('sk');
    expect(page.items[0]).not.toHaveProperty('eventType');
  });

  it('un evento corrupto no se devuelve tal cual', async () => {
    const { client } = fakeClient([{ Items: [{ ...item, outcome: 42 }] }]);
    const reader = createDynamoAuditReader(client, 'AuditEvents');
    await expect(reader.query({ eventType: 'PROJECT_CREATE', limit: 10 })).rejects.toThrow();
  });
});
