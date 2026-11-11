import { describe, expect, it } from 'vitest';
import type { AuditEvent } from '../../src/audit/audit.js';
import { decodeNextToken, encodeNextToken, makeAuditHandlers } from '../../src/audit/handlers.js';
import type { AuditPage, AuditQuery, AuditReader } from '../../src/audit/reader.js';
import type { ApiEvent } from '../../src/shared/event.js';

const sample: AuditEvent = {
  eventId: 'e1',
  timestamp: '2026-11-08T13:10:29.631Z',
  requestId: 'req-x',
  actorRef: 'actor_c9041b20fb5c7865',
  action: 'PROJECT_CREATE',
  resourceRef: 'project:abc',
  outcome: 'SUCCESS',
};

class FakeReader implements AuditReader {
  readonly queries: AuditQuery[] = [];
  page: AuditPage = { items: [sample] };
  query(query: AuditQuery) {
    this.queries.push(query);
    return Promise.resolve(this.page);
  }
}

function setup() {
  const reader = new FakeReader();
  return { reader, handlers: makeAuditHandlers({ reader }) };
}

function claims(group: string, scope = 'openid api/audit.read') {
  return { sub: `${group}-sub`, client_id: 'c', token_use: 'access', scope, 'cognito:groups': `[${group}]` };
}
const auditor = claims('AUDITOR');

function event(query: Record<string, string> | undefined, who: Record<string, unknown> | null = auditor): ApiEvent {
  return {
    requestContext: { requestId: 'req-1', authorizer: who ? { jwt: { claims: who } } : {} },
    queryStringParameters: query,
  };
}

describe('GET /v1/audit (HU-10)', () => {
  it('un AUDITOR obtiene eventos por tipo (CA-10.1)', async () => {
    const { handlers, reader } = setup();
    const response = await handlers.list(event({ type: 'PROJECT_CREATE' }));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ items: [sample] });
    expect(reader.queries[0]).toMatchObject({ eventType: 'PROJECT_CREATE', limit: 50 });
  });

  it('un AUDITOR puede consultar eventos DONATION_FLAGGED', async () => {
    const { handlers, reader } = setup();
    const response = await handlers.list(event({ type: 'DONATION_FLAGGED' }));
    expect(response.statusCode).toBe(200);
    expect(reader.queries[0]).toMatchObject({ eventType: 'DONATION_FLAGGED', limit: 50 });
  });

  it('los eventos solo traen los campos del contrato, sin datos sensibles (CA-10.2)', async () => {
    const { handlers } = setup();
    const body = JSON.parse((await handlers.list(event({ type: 'PROJECT_CREATE' }))).body) as { items: AuditEvent[] };
    expect(Object.keys(body.items[0] ?? {}).sort()).toEqual(
      ['action', 'actorRef', 'eventId', 'outcome', 'requestId', 'resourceRef', 'timestamp'].sort(),
    );
  });

  it('normaliza el rango de fechas a toISOString para comparar con el sort key', async () => {
    const { handlers, reader } = setup();
    await handlers.list(
      event({ type: 'DONATION_CREATE', from: '2026-11-08T08:00:00-05:00', to: '2026-11-08T23:59:59Z', limit: '10' }),
    );
    expect(reader.queries[0]).toMatchObject({
      eventType: 'DONATION_CREATE',
      from: '2026-11-08T13:00:00.000Z',
      to: '2026-11-08T23:59:59.000Z',
      limit: 10,
    });
  });

  it('devuelve nextToken y lo acepta en la página siguiente', async () => {
    const { handlers, reader } = setup();
    reader.page = { items: [sample], nextKey: { eventType: 'PROJECT_CREATE', sk: `${sample.timestamp}#e1` } };
    const first = JSON.parse((await handlers.list(event({ type: 'PROJECT_CREATE' }))).body) as { nextToken: string };
    expect(first.nextToken).toBeTypeOf('string');
    await handlers.list(event({ type: 'PROJECT_CREATE', nextToken: first.nextToken }));
    expect(reader.queries[1]?.startKey).toEqual({ eventType: 'PROJECT_CREATE', sk: `${sample.timestamp}#e1` });
  });

  it.each([
    ['sin type', {}],
    ['type desconocido', { type: 'LOGIN' }],
    ['fecha inválida', { type: 'PROJECT_CREATE', from: 'ayer' }],
    ['from posterior a to', { type: 'PROJECT_CREATE', from: '2026-11-09T00:00:00Z', to: '2026-11-08T00:00:00Z' }],
    ['limit 0', { type: 'PROJECT_CREATE', limit: '0' }],
    ['limit 101', { type: 'PROJECT_CREATE', limit: '101' }],
    ['parámetro desconocido', { type: 'PROJECT_CREATE', actor: 'x' }],
    ['nextToken basura', { type: 'PROJECT_CREATE', nextToken: '%%%' }],
  ])('%s responde 400', async (_caso, query) => {
    const { handlers, reader } = setup();
    expect((await handlers.list(event(query))).statusCode).toBe(400);
    expect(reader.queries).toHaveLength(0);
  });

  it('un nextToken de otro tipo de evento se rechaza (400)', async () => {
    const { handlers } = setup();
    const token = encodeNextToken({ eventType: 'DONATION_CREATE', sk: 'x' });
    expect((await handlers.list(event({ type: 'PROJECT_CREATE', nextToken: token }))).statusCode).toBe(400);
  });

  it.each([
    ['DONANTE', claims('DONANTE', 'openid api/audit.read')],
    ['GESTOR', claims('GESTOR', 'openid api/audit.read')],
    ['AUDITOR sin el scope', claims('AUDITOR', 'openid')],
  ])('%s recibe 403 (CA-10.1)', async (_caso, who) => {
    const { handlers, reader } = setup();
    expect((await handlers.list(event({ type: 'PROJECT_CREATE' }, who))).statusCode).toBe(403);
    expect(reader.queries).toHaveLength(0);
  });

  it('sin identidad responde 401', async () => {
    const { handlers } = setup();
    expect((await handlers.list(event({ type: 'PROJECT_CREATE' }, null))).statusCode).toBe(401);
  });
});

describe('nextToken', () => {
  it('ida y vuelta conserva la clave', () => {
    const key = { eventType: 'PROJECT_CREATE', sk: '2026-11-08T13:10:29.631Z#e1' };
    expect(decodeNextToken(encodeNextToken(key), 'PROJECT_CREATE')).toEqual(key);
  });
});
