import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, QueryCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import { buildAuditEvent } from '../../src/audit/audit.js';
import { createDynamoDonationRepository, DONATIONS_DONOR_INDEX } from '../../src/donations/dynamo-repository.js';
import { expiresAtFrom, idempotencyPk, payloadHash, type IdempotencyRecord } from '../../src/donations/idempotency.js';
import { AppError } from '../../src/shared/errors.js';
import type { Donation } from '../../src/shared/schemas.js';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const DONATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const KEY = '9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b';
const NOW = new Date();

const donation: Donation = {
  donationId: DONATION_ID,
  projectId: PROJECT_ID,
  donorSub: 'ana-sub',
  amountCents: 2500,
  currency: 'PEN',
  status: 'PENDIENTE_SIMULACION',
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};
const record: IdempotencyRecord = {
  pk: idempotencyPk('ana-sub', KEY),
  payloadHash: payloadHash({ projectId: PROJECT_ID, amountCents: 2500 }),
  donationId: DONATION_ID,
  responseStatus: 201,
  responseBody: JSON.stringify(donation),
  expiresAt: expiresAtFrom(NOW),
  createdAt: NOW.toISOString(),
};
const audit = buildAuditEvent({
  requestId: 'req-1',
  actorSub: 'ana-sub',
  action: 'DONATION_CREATE',
  resourceRef: `donation:${DONATION_ID}`,
  outcome: 'SUCCESS',
  now: NOW,
});
const tables = {
  donationsTable: 'Donations',
  idempotencyTable: 'Idempotency',
  projectsTable: 'Projects',
  auditTable: 'AuditEvents',
};

function fakeClient(responses: unknown[]) {
  const sent: unknown[] = [];
  const client = {
    send(command: unknown) {
      sent.push(command);
      const next = responses.shift();
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? {});
    },
  } as unknown as DynamoDBDocumentClient;
  return { client, sent };
}

function canceled(codes: string[]): TransactionCanceledException {
  return new TransactionCanceledException({
    message: 'Transaction cancelled',
    $metadata: {},
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

describe('createDynamoDonationRepository', () => {
  it('createDonation escribe clave, donación, ConditionCheck del proyecto y AuditEvent en una transacción', async () => {
    const { client, sent } = fakeClient([{}]);
    const repo = createDynamoDonationRepository({ client, ...tables });
    expect(await repo.createDonation({ record, donation, audit })).toBe('CREATED');
    const tx = sent[0] as TransactWriteCommand;
    expect(tx).toBeInstanceOf(TransactWriteCommand);
    const items = tx.input.TransactItems ?? [];
    expect(items).toHaveLength(4);
    expect(items[0]?.Put?.TableName).toBe('Idempotency');
    expect(items[0]?.Put?.ConditionExpression).toContain('attribute_not_exists(pk)');
    expect(items[1]?.Put?.TableName).toBe('Donations');
    expect(items[2]?.ConditionCheck?.TableName).toBe('Projects');
    expect(items[2]?.ConditionCheck?.ExpressionAttributeValues).toEqual({ ':published': 'PUBLICADO' });
    expect(items[3]?.Put?.TableName).toBe('AuditEvents');
  });

  it('si la clave ya existe devuelve KEY_EXISTS (sin efectos parciales)', async () => {
    const { client } = fakeClient([canceled(['ConditionalCheckFailed', 'None', 'None', 'None'])]);
    const repo = createDynamoDonationRepository({ client, ...tables });
    expect(await repo.createDonation({ record, donation, audit })).toBe('KEY_EXISTS');
  });

  it('si el proyecto dejó de estar PUBLICADO lanza CONFLICT', async () => {
    const { client } = fakeClient([canceled(['None', 'None', 'ConditionalCheckFailed', 'None'])]);
    const repo = createDynamoDonationRepository({ client, ...tables });
    await expect(repo.createDonation({ record, donation, audit })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('un TransactionConflict lanza CONFLICT (409)', async () => {
    const { client } = fakeClient([canceled(['TransactionConflict', 'None', 'None', 'None'])]);
    const repo = createDynamoDonationRepository({ client, ...tables });
    const promise = repo.createDonation({ record, donation, audit });
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('getIdempotencyRecord usa ConsistentRead e ignora claves vencidas', async () => {
    const expired = { ...record, expiresAt: Math.floor(Date.now() / 1000) - 10 };
    const { client, sent } = fakeClient([{ Item: record }, { Item: expired }]);
    const repo = createDynamoDonationRepository({ client, ...tables });
    expect(await repo.getIdempotencyRecord(record.pk)).toEqual(record);
    expect((sent[0] as GetCommand).input.ConsistentRead).toBe(true);
    expect(await repo.getIdempotencyRecord(record.pk)).toBeUndefined();
  });

  it('listByDonor consulta el GSI donorSub-createdAt con el sub y recorre las páginas', async () => {
    const { client, sent } = fakeClient([
      { Items: [donation], LastEvaluatedKey: { donationId: DONATION_ID } },
      { Items: [{ ...donation, donationId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002' }] },
    ]);
    const repo = createDynamoDonationRepository({ client, donationsTable: 'Donations' });
    expect(await repo.listByDonor('ana-sub')).toHaveLength(2);
    const query = sent[0] as QueryCommand;
    expect(query).toBeInstanceOf(QueryCommand);
    expect(query.input.IndexName).toBe(DONATIONS_DONOR_INDEX);
    expect(query.input.ExpressionAttributeValues).toEqual({ ':sub': 'ana-sub' });
  });

  it('las funciones de lectura no tienen acceso a las tablas de escritura', async () => {
    const { client } = fakeClient([]);
    const repo = createDynamoDonationRepository({ client, donationsTable: 'Donations' });
    await expect(repo.getIdempotencyRecord(record.pk)).rejects.toThrow('TABLE_IDEMPOTENCY');
  });
});

describe('simulateDonation', () => {
  it('confirmar: update condicionado de la donación + ADD en el proyecto + AuditEvent en una transacción', async () => {
    const { client, sent } = fakeClient([{}]);
    const repo = createDynamoDonationRepository({ client, ...tables });
    const result = await repo.simulateDonation({ donation, outcome: 'CONFIRMADA_SIMULADA', updatedAt: 'x', audit });
    expect(result.status).toBe('CONFIRMADA_SIMULADA');
    const items = (sent[0] as TransactWriteCommand).input.TransactItems ?? [];
    expect(items).toHaveLength(3);
    expect(items[0]?.Update?.ConditionExpression).toBe('#status = :pending AND donorSub = :sub');
    expect(items[1]?.Update?.TableName).toBe('Projects');
    expect(items[1]?.Update?.UpdateExpression).toContain('ADD confirmedAmountCents :amount');
    expect(items[1]?.Update?.ExpressionAttributeValues?.[':amount']).toBe(2500);
    expect(items[2]?.Put?.TableName).toBe('AuditEvents');
  });

  it('rechazar no toca el proyecto (CA-06.3)', async () => {
    const { client, sent } = fakeClient([{}]);
    const repo = createDynamoDonationRepository({ client, ...tables });
    await repo.simulateDonation({ donation, outcome: 'RECHAZADA_SIMULADA', updatedAt: 'x', audit });
    const items = (sent[0] as TransactWriteCommand).input.TransactItems ?? [];
    expect(items).toHaveLength(2);
    expect(items.some((item) => item.Update?.TableName === 'Projects')).toBe(false);
  });

  it.each([
    ['ya no está pendiente', ['ConditionalCheckFailed', 'None', 'None']],
    ['conflicto con otra confirmación', ['TransactionConflict', 'None', 'None']],
  ])('%s lanza INVALID_TRANSITION (409)', async (_caso, codes) => {
    const { client } = fakeClient([canceled(codes)]);
    const repo = createDynamoDonationRepository({ client, ...tables });
    await expect(
      repo.simulateDonation({ donation, outcome: 'CONFIRMADA_SIMULADA', updatedAt: 'x', audit }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

describe('idempotency helpers', () => {
  it('el hash no depende del orden de los campos ni de mayúsculas en el UUID', () => {
    expect(payloadHash({ projectId: PROJECT_ID.toUpperCase(), amountCents: 2500 })).toBe(
      payloadHash({ amountCents: 2500, projectId: PROJECT_ID }),
    );
    expect(payloadHash({ projectId: PROJECT_ID, amountCents: 2500 })).not.toBe(
      payloadHash({ projectId: PROJECT_ID, amountCents: 2501 }),
    );
  });

  it('expiresAt es un entero en segundos 24 h después', () => {
    const now = new Date('2026-11-08T10:00:00.000Z');
    expect(expiresAtFrom(now)).toBe(1794132000 + 24 * 3600);
  });
});
