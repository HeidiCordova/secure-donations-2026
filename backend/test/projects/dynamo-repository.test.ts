import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, QueryCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import { buildAuditEvent } from '../../src/audit/audit.js';
import { createDynamoProjectRepository, PROJECTS_STATUS_INDEX } from '../../src/projects/dynamo-repository.js';
import { AppError } from '../../src/shared/errors.js';
import type { Project } from '../../src/shared/schemas.js';

const ID = '22222222-2222-4222-8222-222222222222';
const draft: Project = {
  projectId: ID,
  title: 'Comedor Paucarpata',
  description: 'Alimentación para 50 niños',
  goalAmountCents: 500000,
  confirmedAmountCents: 0,
  currency: 'PEN',
  status: 'BORRADOR',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};
const audit = buildAuditEvent({
  requestId: 'req-1',
  actorSub: 'gestor-sub',
  action: 'PROJECT_PUBLISH',
  resourceRef: `project:${ID}`,
  outcome: 'SUCCESS',
  now: new Date('2026-11-08T10:00:00.000Z'),
});

/** Cliente falso: responde en orden y guarda los comandos enviados. */
function fakeClient(responses: Array<unknown>) {
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

function conditionFailed(): TransactionCanceledException {
  return new TransactionCanceledException({
    message: 'Transaction cancelled',
    $metadata: {},
    CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
  });
}

const tables = { projectsTable: 'Projects', auditTable: 'AuditEvents' };

async function expectAppError(promise: Promise<unknown>, code: AppError['code']): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('createDynamoProjectRepository', () => {
  it('listPublished consulta el GSI status-createdAt y recorre todas las páginas', async () => {
    const published = { ...draft, status: 'PUBLICADO' };
    const { client, sent } = fakeClient([
      { Items: [published], LastEvaluatedKey: { projectId: ID } },
      { Items: [{ ...published, projectId: '11111111-1111-4111-8111-111111111111' }] },
    ]);
    const repo = createDynamoProjectRepository({ client, ...tables });
    const result = await repo.listPublished();
    expect(result).toHaveLength(2);
    expect(sent).toHaveLength(2);
    const first = sent[0] as QueryCommand;
    expect(first).toBeInstanceOf(QueryCommand);
    expect(first.input.IndexName).toBe(PROJECTS_STATUS_INDEX);
    expect(first.input.ExpressionAttributeValues).toEqual({ ':published': 'PUBLICADO' });
  });

  it('publish escribe proyecto y auditoría en una sola transacción condicionada (CA-08.3)', async () => {
    const { client, sent } = fakeClient([{ Item: draft }, {}]);
    const repo = createDynamoProjectRepository({ client, ...tables });
    const result = await repo.publish(ID, '2026-11-08T10:00:00.000Z', audit);
    expect(result.status).toBe('PUBLICADO');
    expect(sent[0]).toBeInstanceOf(GetCommand);
    const tx = sent[1] as TransactWriteCommand;
    expect(tx).toBeInstanceOf(TransactWriteCommand);
    expect(tx.input.TransactItems).toHaveLength(2);
    expect(tx.input.TransactItems?.[0]?.Update?.ConditionExpression).toContain('#status = :draft');
    expect(tx.input.TransactItems?.[1]?.Put?.TableName).toBe('AuditEvents');
  });

  it('publish de un proyecto inexistente lanza NOT_FOUND sin escribir', async () => {
    const { client, sent } = fakeClient([{}]);
    const repo = createDynamoProjectRepository({ client, ...tables });
    await expectAppError(repo.publish(ID, 'x', audit), 'NOT_FOUND');
    expect(sent).toHaveLength(1);
  });

  it('publish de uno ya publicado lanza CONFLICT sin escribir', async () => {
    const { client, sent } = fakeClient([{ Item: { ...draft, status: 'PUBLICADO' } }]);
    const repo = createDynamoProjectRepository({ client, ...tables });
    await expectAppError(repo.publish(ID, 'x', audit), 'CONFLICT');
    expect(sent).toHaveLength(1);
  });

  it('dos publicaciones concurrentes: la que pierde la condición recibe CONFLICT', async () => {
    const { client } = fakeClient([{ Item: draft }, conditionFailed()]);
    const repo = createDynamoProjectRepository({ client, ...tables });
    await expectAppError(repo.publish(ID, 'x', audit), 'CONFLICT');
  });

  it('create con projectId repetido lanza CONFLICT', async () => {
    const { client } = fakeClient([conditionFailed()]);
    const repo = createDynamoProjectRepository({ client, ...tables });
    await expectAppError(repo.create(draft, audit), 'CONFLICT');
  });

  it('un registro corrupto en la base no se devuelve tal cual', async () => {
    const { client } = fakeClient([{ Item: { ...draft, goalAmountCents: 'mucho' } }]);
    const repo = createDynamoProjectRepository({ client, ...tables });
    await expect(repo.get(ID)).rejects.toThrow();
  });
});
