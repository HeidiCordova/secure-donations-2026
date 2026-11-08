import { describe, expect, it } from 'vitest';
import { pseudonymize, type AuditEvent, type AuditLog } from '../../src/audit/audit.js';
import { makeProjectHandlers } from '../../src/projects/handlers.js';
import type { ProjectRepository } from '../../src/projects/repository.js';
import { AppError } from '../../src/shared/errors.js';
import type { ApiEvent } from '../../src/shared/event.js';
import type { Project } from '../../src/shared/schemas.js';

const PUBLISHED_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const NEW_ID = '33333333-3333-4333-8333-333333333333';
const MISSING_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-08T10:00:00.000Z');

function project(overrides: Partial<Project>): Project {
  return {
    projectId: PUBLISHED_ID,
    title: 'Comedor Paucarpata',
    description: 'Alimentación para 50 niños',
    goalAmountCents: 500000,
    confirmedAmountCents: 120000,
    currency: 'PEN',
    status: 'PUBLICADO',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Repositorio en memoria con la misma semántica que el de DynamoDB (escritura + auditoría juntas). */
class InMemoryProjects implements ProjectRepository {
  readonly items = new Map<string, Project>();
  readonly audits: AuditEvent[] = [];

  constructor(initial: Project[] = []) {
    for (const p of initial) this.items.set(p.projectId, p);
  }

  listPublished() {
    return Promise.resolve([...this.items.values()].filter((p) => p.status === 'PUBLICADO'));
  }

  get(projectId: string) {
    return Promise.resolve(this.items.get(projectId));
  }

  create(p: Project, audit: AuditEvent) {
    if (this.items.has(p.projectId)) return Promise.reject(new AppError('CONFLICT', 'El recurso ya existe'));
    this.items.set(p.projectId, p);
    this.audits.push(audit);
    return Promise.resolve();
  }

  publish(projectId: string, updatedAt: string, audit: AuditEvent) {
    const current = this.items.get(projectId);
    if (!current) return Promise.reject(new AppError('NOT_FOUND', 'Recurso no encontrado'));
    if (current.status !== 'BORRADOR') return Promise.reject(new AppError('CONFLICT', 'El proyecto ya está publicado'));
    const published: Project = { ...current, status: 'PUBLICADO', updatedAt };
    this.items.set(projectId, published);
    this.audits.push(audit);
    return Promise.resolve(published);
  }
}

class MemoryAudit implements AuditLog {
  readonly events: AuditEvent[] = [];
  record(event: AuditEvent) {
    this.events.push(event);
    return Promise.resolve();
  }
}

function setup(
  initial: Project[] = [project({}), project({ projectId: DRAFT_ID, status: 'BORRADOR', confirmedAmountCents: 0 })],
) {
  const projects = new InMemoryProjects(initial);
  const audit = new MemoryAudit();
  const handlers = makeProjectHandlers({ projects, audit, now: () => NOW, newId: () => NEW_ID });
  return { projects, audit, handlers };
}

const gestorClaims = {
  sub: 'gestor-sub',
  client_id: 'client-abc',
  token_use: 'access',
  scope: 'openid api/projects.write',
  'cognito:groups': '[GESTOR]',
};
const donanteClaims = { ...gestorClaims, sub: 'donante-sub', 'cognito:groups': '[DONANTE]' };

function event(options: {
  claims?: Record<string, unknown>;
  projectId?: string;
  body?: unknown;
  rawBody?: string;
}): ApiEvent {
  return {
    requestContext: {
      requestId: 'req-1',
      authorizer: options.claims ? { jwt: { claims: options.claims } } : {},
    },
    pathParameters: options.projectId ? { projectId: options.projectId } : undefined,
    body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  };
}

const validBody = { title: 'Biblioteca comunal', description: 'Libros para Cerro Colorado', goalAmountCents: 300000 };

describe('GET /v1/projects (HU-01, T01)', () => {
  it('devuelve solo proyectos PUBLICADO (CA-01.1, CA-01.2)', async () => {
    const { handlers } = setup();
    const response = await handlers.list(event({}));
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { items: Project[] };
    expect(body.items.map((p) => p.projectId)).toEqual([PUBLISHED_ID]);
    expect(body.items[0]).toMatchObject({
      title: 'Comedor Paucarpata',
      goalAmountCents: 500000,
      confirmedAmountCents: 120000,
    });
  });

  it('nunca devuelve un BORRADOR aunque el repositorio lo entregue (defensa en profundidad)', async () => {
    const { handlers, projects } = setup();
    projects.listPublished = () => Promise.resolve([...projects.items.values()]);
    const body = JSON.parse((await handlers.list(event({}))).body) as { items: Project[] };
    expect(body.items.every((p) => p.status === 'PUBLICADO')).toBe(true);
  });

  it('sin proyectos publicados devuelve lista vacía, no error (CA-01.3)', async () => {
    const { handlers } = setup([]);
    const response = await handlers.list(event({}));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ items: [] });
  });

  it('un fallo interno responde 500 genérico sin detalles', async () => {
    const { handlers, projects } = setup();
    projects.listPublished = () => Promise.reject(new Error('ResourceNotFoundException: tabla x'));
    const response = await handlers.list(event({}));
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('tabla');
  });
});

describe('GET /v1/projects/{projectId} (HU-02)', () => {
  it('devuelve el detalle de un proyecto publicado (CA-02.1)', async () => {
    const { handlers } = setup();
    const response = await handlers.get(event({ projectId: PUBLISHED_ID }));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ projectId: PUBLISHED_ID, status: 'PUBLICADO' });
  });

  it.each([
    ['BORRADOR', DRAFT_ID],
    ['inexistente', MISSING_ID],
    ['id que no es UUID', 'abc'],
  ])('%s responde 404 sin revelar contenido (CA-02.2)', async (_caso, projectId) => {
    const { handlers } = setup();
    const response = await handlers.get(event({ projectId }));
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('Comedor');
    expect(JSON.parse(response.body)).toMatchObject({ code: 'NOT_FOUND', requestId: 'req-1' });
  });
});

describe('GET /v1/projects/{projectId}/stats (HU-09)', () => {
  it('devuelve solo agregados confirmados, sin datos de donantes (CA-09.1, CA-09.2)', async () => {
    const { handlers } = setup();
    const response = await handlers.stats(event({ projectId: PUBLISHED_ID }));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      projectId: PUBLISHED_ID,
      goalAmountCents: 500000,
      confirmedAmountCents: 120000,
      currency: 'PEN',
    });
  });

  it('un BORRADOR responde 404', async () => {
    const { handlers } = setup();
    expect((await handlers.stats(event({ projectId: DRAFT_ID }))).statusCode).toBe(404);
  });
});

describe('POST /v1/projects (HU-08)', () => {
  it('un GESTOR crea el proyecto en BORRADOR con monto confirmado 0 (CA-08.1)', async () => {
    const { handlers, projects } = setup();
    const response = await handlers.create(event({ claims: gestorClaims, body: validBody }));
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toMatchObject({
      projectId: NEW_ID,
      status: 'BORRADOR',
      confirmedAmountCents: 0,
      currency: 'PEN',
      createdAt: NOW.toISOString(),
    });
    expect(projects.items.get(NEW_ID)?.status).toBe('BORRADOR');
  });

  it('registra un AuditEvent con actor seudonimizado y sin datos del body (CA-08.3, CA-10.2)', async () => {
    const { handlers, projects } = setup();
    await handlers.create(event({ claims: gestorClaims, body: validBody }));
    expect(projects.audits).toHaveLength(1);
    const audit = projects.audits[0];
    expect(audit).toMatchObject({
      action: 'PROJECT_CREATE',
      outcome: 'SUCCESS',
      resourceRef: `project:${NEW_ID}`,
      requestId: 'req-1',
      timestamp: NOW.toISOString(),
      actorRef: pseudonymize('gestor-sub'),
    });
    expect(JSON.stringify(audit)).not.toContain('gestor-sub');
    expect(JSON.stringify(audit)).not.toContain('Biblioteca');
  });

  it('un DONANTE recibe 403, no se crea nada y queda auditado como DENIED (CA-04.1, T03)', async () => {
    const { handlers, projects, audit } = setup();
    const response = await handlers.create(event({ claims: donanteClaims, body: validBody }));
    expect(response.statusCode).toBe(403);
    expect(projects.items.has(NEW_ID)).toBe(false);
    expect(audit.events).toMatchObject([{ action: 'PROJECT_CREATE', outcome: 'DENIED' }]);
  });

  it('un GESTOR sin el scope api/projects.write recibe 403', async () => {
    const { handlers } = setup();
    const response = await handlers.create(event({ claims: { ...gestorClaims, scope: 'openid' }, body: validBody }));
    expect(response.statusCode).toBe(403);
  });

  it('sin identidad responde 401 y no audita (no hay actor)', async () => {
    const { handlers, audit } = setup();
    const response = await handlers.create(event({ body: validBody }));
    expect(response.statusCode).toBe(401);
    expect(audit.events).toHaveLength(0);
  });

  it.each([
    ['objetivo 0', { ...validBody, goalAmountCents: 0 }],
    ['objetivo decimal', { ...validBody, goalAmountCents: 10.5 }],
    ['status enviado por el cliente', { ...validBody, status: 'PUBLICADO' }],
    ['título vacío', { ...validBody, title: '' }],
  ])('%s responde 400 (CA-08.1)', async (_caso, body) => {
    const { handlers, projects, audit } = setup();
    const response = await handlers.create(event({ claims: gestorClaims, body }));
    expect(response.statusCode).toBe(400);
    expect(projects.items.has(NEW_ID)).toBe(false);
    expect(audit.events).toMatchObject([{ outcome: 'INVALID' }]);
  });

  it('un body que no es JSON responde 400', async () => {
    const { handlers } = setup();
    const response = await handlers.create(event({ claims: gestorClaims, rawBody: '{no-json' }));
    expect(response.statusCode).toBe(400);
  });
});

describe('PATCH /v1/projects/{projectId}/publish (HU-08)', () => {
  it('un GESTOR publica un BORRADOR y queda visible en el catálogo (CA-08.2)', async () => {
    const { handlers, projects } = setup();
    const response = await handlers.publish(event({ claims: gestorClaims, projectId: DRAFT_ID }));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      projectId: DRAFT_ID,
      status: 'PUBLICADO',
      updatedAt: NOW.toISOString(),
    });
    expect(projects.audits).toMatchObject([
      { action: 'PROJECT_PUBLISH', outcome: 'SUCCESS', resourceRef: `project:${DRAFT_ID}` },
    ]);

    const list = JSON.parse((await handlers.list(event({}))).body) as { items: Project[] };
    expect(list.items.map((p) => p.projectId).sort()).toEqual([PUBLISHED_ID, DRAFT_ID].sort());
  });

  it('publicar uno ya publicado responde 409 y se audita como CONFLICT (CA-08.2)', async () => {
    const { handlers, audit } = setup();
    const response = await handlers.publish(event({ claims: gestorClaims, projectId: PUBLISHED_ID }));
    expect(response.statusCode).toBe(409);
    expect(audit.events).toMatchObject([{ action: 'PROJECT_PUBLISH', outcome: 'CONFLICT' }]);
  });

  it('un proyecto inexistente responde 404', async () => {
    const { handlers } = setup();
    expect((await handlers.publish(event({ claims: gestorClaims, projectId: MISSING_ID }))).statusCode).toBe(404);
  });

  it('un DONANTE recibe 403 y el proyecto sigue en BORRADOR (CA-04.1)', async () => {
    const { handlers, projects } = setup();
    const response = await handlers.publish(event({ claims: donanteClaims, projectId: DRAFT_ID }));
    expect(response.statusCode).toBe(403);
    expect(projects.items.get(DRAFT_ID)?.status).toBe('BORRADOR');
  });

  it('si la auditoría del intento fallido falla, se responde igual el error original', async () => {
    const { handlers, audit } = setup();
    audit.record = () => Promise.reject(new Error('audit caída'));
    const response = await handlers.publish(event({ claims: donanteClaims, projectId: DRAFT_ID }));
    expect(response.statusCode).toBe(403);
  });
});
