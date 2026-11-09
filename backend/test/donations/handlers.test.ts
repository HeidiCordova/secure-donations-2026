import { describe, expect, it } from 'vitest';
import { pseudonymize, type AuditEvent, type AuditLog } from '../../src/audit/audit.js';
import { makeDonationHandlers } from '../../src/donations/handlers.js';
import type { IdempotencyRecord } from '../../src/donations/idempotency.js';
import type { CreateDonationWrite, DonationRepository, SimulateDonationWrite } from '../../src/donations/repository.js';
import { AppError } from '../../src/shared/errors.js';
import type { ApiEvent } from '../../src/shared/event.js';
import type { Donation, Project } from '../../src/shared/schemas.js';

const PUBLISHED_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const MISSING_ID = '44444444-4444-4444-8444-444444444444';
const KEY = '9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b';
const OTHER_KEY = '0c3e7d2f-4b5e-4f60-9b7c-8d9e0f1a2b3c';
const NOW = new Date('2026-11-08T10:00:00.000Z');

function project(overrides: Partial<Project>): Project {
  return {
    projectId: PUBLISHED_ID,
    title: 'Comedor Paucarpata',
    description: 'Alimentación para 50 niños',
    goalAmountCents: 500000,
    confirmedAmountCents: 0,
    currency: 'PEN',
    status: 'PUBLICADO',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Repositorio en memoria con la misma semántica atómica que DynamoDB. */
class InMemoryDonations implements DonationRepository {
  readonly projects = new Map<string, Project>();
  readonly donations = new Map<string, Donation>();
  readonly records = new Map<string, IdempotencyRecord>();
  readonly audits: AuditEvent[] = [];
  /** Permite simular que otra solicitud reserva la clave justo antes de esta. */
  beforeWrite?: (write: CreateDonationWrite) => void;

  constructor(projects: Project[]) {
    for (const p of projects) this.projects.set(p.projectId, p);
  }

  getIdempotencyRecord(pk: string) {
    return Promise.resolve(this.records.get(pk));
  }

  getProject(projectId: string) {
    return Promise.resolve(this.projects.get(projectId));
  }

  createDonation(write: CreateDonationWrite) {
    this.beforeWrite?.(write);
    if (this.records.has(write.record.pk)) return Promise.resolve('KEY_EXISTS' as const);
    if (this.projects.get(write.donation.projectId)?.status !== 'PUBLICADO') {
      return Promise.reject(new AppError('CONFLICT', 'El proyecto no acepta donaciones'));
    }
    this.records.set(write.record.pk, write.record);
    this.donations.set(write.donation.donationId, write.donation);
    this.audits.push(write.audit);
    return Promise.resolve('CREATED' as const);
  }

  listByDonor(donorSub: string) {
    return Promise.resolve([...this.donations.values()].filter((d) => d.donorSub === donorSub));
  }

  getDonation(donationId: string) {
    return Promise.resolve(this.donations.get(donationId));
  }

  /** Comprobación y escritura en el mismo paso, como la transacción condicionada de DynamoDB. */
  simulateDonation({ donation, outcome, updatedAt, audit }: SimulateDonationWrite) {
    const current = this.donations.get(donation.donationId);
    if (!current || current.status !== 'PENDIENTE_SIMULACION' || current.donorSub !== donation.donorSub) {
      return Promise.reject(new AppError('INVALID_TRANSITION', 'La donación ya no está pendiente'));
    }
    const updated: Donation = { ...current, status: outcome, updatedAt };
    this.donations.set(updated.donationId, updated);
    if (outcome === 'CONFIRMADA_SIMULADA') {
      const p = this.projects.get(current.projectId);
      if (p)
        this.projects.set(p.projectId, { ...p, confirmedAmountCents: p.confirmedAmountCents + current.amountCents });
    }
    this.audits.push(audit);
    return Promise.resolve(updated);
  }
}

class MemoryAudit implements AuditLog {
  readonly events: AuditEvent[] = [];
  record(event: AuditEvent) {
    this.events.push(event);
    return Promise.resolve();
  }
}

function setup(stage = 'academic') {
  const repo = new InMemoryDonations([project({}), project({ projectId: DRAFT_ID, status: 'BORRADOR' })]);
  const audit = new MemoryAudit();
  let counter = 0;
  const handlers = makeDonationHandlers({
    donations: repo,
    audit,
    stage,
    now: () => NOW,
    newId: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++counter).padStart(12, '0')}`,
  });
  return { repo, audit, handlers };
}

function claims(sub: string, group: string, scope = 'openid api/donations.write api/donations.read') {
  return { sub, client_id: 'client-abc', token_use: 'access', scope, 'cognito:groups': `[${group}]` };
}
const ana = claims('ana-sub', 'DONANTE');
const beto = claims('beto-sub', 'DONANTE');
const gestor = claims('gestor-sub', 'GESTOR', 'openid api/projects.write api/donations.read api/donations.write');

function event(options: {
  claims?: Record<string, unknown>;
  body?: unknown;
  key?: string | undefined;
  headerName?: string;
  donationId?: string;
}): ApiEvent {
  return {
    requestContext: { requestId: 'req-1', authorizer: options.claims ? { jwt: { claims: options.claims } } : {} },
    headers: options.key === undefined ? {} : { [options.headerName ?? 'idempotency-key']: options.key },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    pathParameters: options.donationId ? { donationId: options.donationId } : undefined,
  };
}

const validBody = { projectId: PUBLISHED_ID, amountCents: 2500 };

describe('POST /v1/donations (HU-05)', () => {
  it('crea la donación PENDIENTE_SIMULACION con 201 y el donorSub del token (CA-05.1, CA-05.3, T05)', async () => {
    const { handlers, repo } = setup();
    const response = await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as Donation;
    expect(body).toMatchObject({
      projectId: PUBLISHED_ID,
      amountCents: 2500,
      currency: 'PEN',
      status: 'PENDIENTE_SIMULACION',
    });
    expect(repo.donations.size).toBe(1);
    // Se guarda con el sub del token, pero no se devuelve en la respuesta (CA-NF10.1)
    expect([...repo.donations.values()][0]?.donorSub).toBe('ana-sub');
    expect(body).not.toHaveProperty('donorSub');
  });

  it('ninguna respuesta de donaciones incluye donorSub', async () => {
    const { handlers } = setup();
    const created = await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    const replay = await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    const id = (JSON.parse(created.body) as Donation).donationId;
    const one = await handlers.get(event({ claims: ana, donationId: id }));
    const mine = await handlers.listMine(event({ claims: ana }));
    const simulated = await handlers.simulate(
      event({ claims: ana, donationId: id, body: { outcome: 'CONFIRMADA_SIMULADA' } }),
    );
    for (const response of [created, replay, one, mine, simulated]) {
      expect(response.body).not.toContain('donorSub');
      expect(response.body).not.toContain('ana-sub');
    }
  });

  it('acepta la cabecera con cualquier combinación de mayúsculas', async () => {
    const { handlers } = setup();
    const response = await handlers.create(
      event({ claims: ana, body: validBody, key: KEY, headerName: 'Idempotency-Key' }),
    );
    expect(response.statusCode).toBe(201);
  });

  it('guarda el registro de idempotencia con hash, respuesta y TTL de 24 h en segundos', async () => {
    const { handlers, repo } = setup();
    await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    const record = repo.records.get(`ana-sub#createDonation#${KEY}`);
    expect(record).toBeDefined();
    expect(record?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record?.responseStatus).toBe(201);
    expect(record?.expiresAt).toBe(Math.floor(NOW.getTime() / 1000) + 24 * 3600);
    expect(Number.isInteger(record?.expiresAt)).toBe(true);
  });

  it('registra un AuditEvent sin el monto ni el sub real (CA-10.2)', async () => {
    const { handlers, repo } = setup();
    await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    expect(repo.audits).toHaveLength(1);
    expect(repo.audits[0]).toMatchObject({
      action: 'DONATION_CREATE',
      outcome: 'SUCCESS',
      actorRef: pseudonymize('ana-sub'),
    });
    expect(JSON.stringify(repo.audits[0])).not.toContain('ana-sub');
    expect(JSON.stringify(repo.audits[0])).not.toContain('2500');
  });

  it.each([
    ['monto 0', 0],
    ['monto negativo', -100],
    ['monto 99', 99],
    ['monto 100001', 100001],
    ['monto decimal', 10.5],
    ['monto como texto', '500'],
  ])('%s responde 400 y no crea nada (CA-05.2, T04)', async (_caso, amountCents) => {
    const { handlers, repo } = setup();
    const response = await handlers.create(event({ claims: ana, body: { ...validBody, amountCents }, key: KEY }));
    expect(response.statusCode).toBe(400);
    expect(repo.donations.size).toBe(0);
    expect(repo.records.size).toBe(0);
  });

  it.each([
    ['sin Idempotency-Key', undefined],
    ['Idempotency-Key que no es UUID', 'abc'],
  ])('%s responde 400 (CA-05.2)', async (_caso, key) => {
    const { handlers, repo } = setup();
    const response = await handlers.create(event({ claims: ana, body: validBody, key }));
    expect(response.statusCode).toBe(400);
    expect(repo.donations.size).toBe(0);
  });

  it('un donorSub enviado en el body se rechaza con 400 (CA-05.3)', async () => {
    const { handlers, repo } = setup();
    const response = await handlers.create(
      event({ claims: ana, body: { ...validBody, donorSub: 'beto-sub' }, key: KEY }),
    );
    expect(response.statusCode).toBe(400);
    expect(repo.donations.size).toBe(0);
  });

  it('proyecto inexistente responde 404 y no publicado 409 (CA-05.2)', async () => {
    const { handlers, repo } = setup();
    const missing = await handlers.create(
      event({ claims: ana, body: { ...validBody, projectId: MISSING_ID }, key: KEY }),
    );
    expect(missing.statusCode).toBe(404);
    const draft = await handlers.create(
      event({ claims: ana, body: { ...validBody, projectId: DRAFT_ID }, key: OTHER_KEY }),
    );
    expect(draft.statusCode).toBe(409);
    expect(repo.donations.size).toBe(0);
  });

  it('un GESTOR recibe 403 y queda auditado como DENIED (CA-04.1)', async () => {
    const { handlers, repo, audit } = setup();
    const response = await handlers.create(event({ claims: gestor, body: validBody, key: KEY }));
    expect(response.statusCode).toBe(403);
    expect(repo.donations.size).toBe(0);
    expect(audit.events).toMatchObject([{ action: 'DONATION_CREATE', outcome: 'DENIED' }]);
  });

  it('un DONANTE sin el scope api/donations.write recibe 403', async () => {
    const { handlers } = setup();
    const response = await handlers.create(
      event({ claims: claims('ana-sub', 'DONANTE', 'openid api/donations.read'), body: validBody, key: KEY }),
    );
    expect(response.statusCode).toBe(403);
  });

  it('sin identidad responde 401 (T02)', async () => {
    const { handlers } = setup();
    expect((await handlers.create(event({ body: validBody, key: KEY }))).statusCode).toBe(401);
  });
});

describe('Idempotencia (CA-05.4)', () => {
  it('misma clave y mismo body devuelve la MISMA respuesta y una sola donación (T06)', async () => {
    const { handlers, repo } = setup();
    const first = await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    const second = await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    expect(second.statusCode).toBe(first.statusCode);
    expect(second.body).toBe(first.body);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(repo.donations.size).toBe(1);
  });

  it('misma clave con body distinto responde 409 IDEMPOTENCY_MISMATCH (T07)', async () => {
    const { handlers, repo } = setup();
    await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    const response = await handlers.create(event({ claims: ana, body: { ...validBody, amountCents: 9999 }, key: KEY }));
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
    expect(repo.donations.size).toBe(1);
  });

  it('el reintento devuelve lo guardado aunque el proyecto ya no esté publicado', async () => {
    const { handlers, repo } = setup();
    const first = await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    repo.projects.set(PUBLISHED_ID, project({ status: 'BORRADOR' }));
    const second = await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    expect(second.statusCode).toBe(201);
    expect(second.body).toBe(first.body);
  });

  it('la clave es por usuario: otro donante con la misma clave crea su propia donación', async () => {
    const { handlers, repo } = setup();
    await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    const response = await handlers.create(event({ claims: beto, body: validBody, key: KEY }));
    expect(response.statusCode).toBe(201);
    expect(repo.donations.size).toBe(2);
  });

  it('carrera: si otra solicitud reserva la clave antes de escribir, se repite su respuesta', async () => {
    const { handlers, repo } = setup();
    const winner = await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    const winnerRecord = repo.records.get(`ana-sub#createDonation#${KEY}`);
    // Simula que la lectura inicial no vio la clave (dos solicitudes simultáneas)
    repo.records.clear();
    repo.beforeWrite = () => {
      if (winnerRecord) repo.records.set(winnerRecord.pk, winnerRecord);
    };
    const loser = await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    expect(loser.statusCode).toBe(201);
    expect(loser.body).toBe(winner.body);
    expect(repo.donations.size).toBe(1);
  });

  it('10 solicitudes en paralelo con la misma clave crean una sola donación', async () => {
    const { handlers, repo } = setup();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => handlers.create(event({ claims: ana, body: validBody, key: KEY }))),
    );
    expect(responses.every((r) => r.statusCode === 201)).toBe(true);
    expect(new Set(responses.map((r) => r.body)).size).toBe(1);
    expect(repo.donations.size).toBe(1);
  });
});

describe('GET /v1/donations/me (HU-07)', () => {
  it('devuelve solo las donaciones del sub autenticado (CA-07.1)', async () => {
    const { handlers } = setup();
    const own = await handlers.create(event({ claims: ana, body: validBody, key: KEY }));
    await handlers.create(event({ claims: beto, body: validBody, key: OTHER_KEY }));
    const response = await handlers.listMine(event({ claims: ana }));
    expect(response.statusCode).toBe(200);
    const { items } = JSON.parse(response.body) as { items: Donation[] };
    expect(items).toHaveLength(1);
    expect(items[0]?.donationId).toBe((JSON.parse(own.body) as Donation).donationId);
  });

  it('sin donaciones devuelve lista vacía', async () => {
    const { handlers } = setup();
    expect(JSON.parse((await handlers.listMine(event({ claims: ana }))).body)).toEqual({ items: [] });
  });

  it('un GESTOR no puede consultar historiales: 403 (CA-04.2, T12)', async () => {
    const { handlers } = setup();
    expect((await handlers.listMine(event({ claims: gestor }))).statusCode).toBe(403);
  });
});

describe('GET /v1/donations/{donationId} (CA-07.2, T09)', () => {
  it('el dueño ve su donación', async () => {
    const { handlers } = setup();
    const created = JSON.parse(
      (await handlers.create(event({ claims: ana, body: validBody, key: KEY }))).body,
    ) as Donation;
    const response = await handlers.get(event({ claims: ana, donationId: created.donationId }));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ donationId: created.donationId });
  });

  it('otro donante recibe 404 sin datos de la donación (anti-BOLA)', async () => {
    const { handlers } = setup();
    const created = JSON.parse(
      (await handlers.create(event({ claims: ana, body: validBody, key: KEY }))).body,
    ) as Donation;
    const response = await handlers.get(event({ claims: beto, donationId: created.donationId }));
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('ana-sub');
    expect(response.body).not.toContain('2500');
  });

  it('inexistente o id inválido responde 404, igual que una ajena', async () => {
    const { handlers } = setup();
    expect((await handlers.get(event({ claims: ana, donationId: MISSING_ID }))).statusCode).toBe(404);
    expect((await handlers.get(event({ claims: ana, donationId: 'abc' }))).statusCode).toBe(404);
  });

  it('un GESTOR recibe 403 (T12)', async () => {
    const { handlers } = setup();
    expect((await handlers.get(event({ claims: gestor, donationId: MISSING_ID }))).statusCode).toBe(403);
  });
});

describe('POST /v1/donations/{donationId}/simulate (HU-06)', () => {
  async function pendingDonation(ctx: ReturnType<typeof setup>, who = ana, key = KEY): Promise<Donation> {
    const response = await ctx.handlers.create(event({ claims: who, body: validBody, key }));
    return JSON.parse(response.body) as Donation;
  }

  it('confirmar pasa a CONFIRMADA_SIMULADA y suma el monto al proyecto (CA-06.1)', async () => {
    const ctx = setup();
    const created = await pendingDonation(ctx);
    const response = await ctx.handlers.simulate(
      event({ claims: ana, donationId: created.donationId, body: { outcome: 'CONFIRMADA_SIMULADA' } }),
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ donationId: created.donationId, status: 'CONFIRMADA_SIMULADA' });
    expect(ctx.repo.projects.get(PUBLISHED_ID)?.confirmedAmountCents).toBe(2500);
    expect(ctx.repo.audits.at(-1)).toMatchObject({ action: 'DONATION_SIMULATE', outcome: 'SUCCESS' });
  });

  it('rechazar pasa a RECHAZADA_SIMULADA y no cambia el total (CA-06.3)', async () => {
    const ctx = setup();
    const created = await pendingDonation(ctx);
    const response = await ctx.handlers.simulate(
      event({ claims: ana, donationId: created.donationId, body: { outcome: 'RECHAZADA_SIMULADA' } }),
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ status: 'RECHAZADA_SIMULADA' });
    expect(ctx.repo.projects.get(PUBLISHED_ID)?.confirmedAmountCents).toBe(0);
  });

  it('una segunda transición responde 409 y no vuelve a sumar (CA-06.2)', async () => {
    const ctx = setup();
    const created = await pendingDonation(ctx);
    const confirm = event({ claims: ana, donationId: created.donationId, body: { outcome: 'CONFIRMADA_SIMULADA' } });
    await ctx.handlers.simulate(confirm);
    const again = await ctx.handlers.simulate(confirm);
    expect(again.statusCode).toBe(409);
    expect(JSON.parse(again.body)).toMatchObject({ code: 'INVALID_TRANSITION' });
    const reject = await ctx.handlers.simulate(
      event({ claims: ana, donationId: created.donationId, body: { outcome: 'RECHAZADA_SIMULADA' } }),
    );
    expect(reject.statusCode).toBe(409);
    expect(ctx.repo.projects.get(PUBLISHED_ID)?.confirmedAmountCents).toBe(2500);
  });

  it('10 confirmaciones en paralelo: una sola 200, nueve 409 y un solo incremento (T08, CA-NF04.1)', async () => {
    const ctx = setup();
    const created = await pendingDonation(ctx);
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        ctx.handlers.simulate(
          event({ claims: ana, donationId: created.donationId, body: { outcome: 'CONFIRMADA_SIMULADA' } }),
        ),
      ),
    );
    expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.statusCode === 409)).toHaveLength(9);
    expect(ctx.repo.projects.get(PUBLISHED_ID)?.confirmedAmountCents).toBe(2500);
  });

  it('la donación de otro donante responde 404 y no cambia (CA-06.1, anti-BOLA)', async () => {
    const ctx = setup();
    const created = await pendingDonation(ctx);
    const response = await ctx.handlers.simulate(
      event({ claims: beto, donationId: created.donationId, body: { outcome: 'CONFIRMADA_SIMULADA' } }),
    );
    expect(response.statusCode).toBe(404);
    expect(ctx.repo.donations.get(created.donationId)?.status).toBe('PENDIENTE_SIMULACION');
    expect(ctx.repo.projects.get(PUBLISHED_ID)?.confirmedAmountCents).toBe(0);
  });

  it('fuera del stage academic la ruta responde 404 (CA-06.1)', async () => {
    const ctx = setup('prod');
    const response = await ctx.handlers.simulate(
      event({ claims: ana, donationId: MISSING_ID, body: { outcome: 'CONFIRMADA_SIMULADA' } }),
    );
    expect(response.statusCode).toBe(404);
  });

  it.each([['PENDIENTE_SIMULACION'], ['PAGADA'], [undefined]])('outcome %s responde 400', async (outcome) => {
    const ctx = setup();
    const created = await pendingDonation(ctx);
    const response = await ctx.handlers.simulate(
      event({ claims: ana, donationId: created.donationId, body: { outcome } }),
    );
    expect(response.statusCode).toBe(400);
  });

  it('un GESTOR recibe 403 y una inexistente 404', async () => {
    const ctx = setup();
    const body = { outcome: 'CONFIRMADA_SIMULADA' };
    expect((await ctx.handlers.simulate(event({ claims: gestor, donationId: MISSING_ID, body }))).statusCode).toBe(403);
    expect((await ctx.handlers.simulate(event({ claims: ana, donationId: MISSING_ID, body }))).statusCode).toBe(404);
  });
});
