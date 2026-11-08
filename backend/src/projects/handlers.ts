import { randomUUID } from 'node:crypto';
import { buildAuditEvent, outcomeFromError, type AuditAction, type AuditLog } from '../audit/audit.js';
import { getPrincipal, requireGroup, requireScope } from '../authz/principal.js';
import { AppError } from '../shared/errors.js';
import { parseJsonBody, uuidPathParam, type ApiEvent } from '../shared/event.js';
import { errorResponse, json, type HttpResponse } from '../shared/http.js';
import { CreateProjectBodySchema, type Project, type ProjectStats } from '../shared/schemas.js';
import { parseOrThrow } from '../shared/validation.js';
import type { ProjectRepository } from './repository.js';

export const PROJECTS_WRITE_SCOPE = 'api/projects.write';

export interface ProjectDeps {
  projects: ProjectRepository;
  audit: AuditLog;
  now?: () => Date;
  newId?: () => string;
}

/**
 * Vista pública (CA-01.1, CA-02.1, CA-09.2): se copian campo por campo para no exponer
 * atributos internos de DynamoDB ni datos de donantes.
 */
export function toPublicProject(project: Project): Project {
  return {
    projectId: project.projectId,
    title: project.title,
    description: project.description,
    goalAmountCents: project.goalAmountCents,
    confirmedAmountCents: project.confirmedAmountCents,
    currency: project.currency,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function notFound(): AppError {
  return new AppError('NOT_FOUND', 'Recurso no encontrado');
}

export function makeProjectHandlers(deps: ProjectDeps) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => randomUUID());

  /** Lectura pública de un proyecto: BORRADOR o inexistente se tratan igual, 404 (CA-02.2). */
  async function getPublished(event: ApiEvent): Promise<Project> {
    const projectId = uuidPathParam(event, 'projectId');
    const project = await deps.projects.get(projectId);
    if (project === undefined || project.status !== 'PUBLICADO') {
      throw notFound();
    }
    return project;
  }

  /** Registra un intento fallido sin ocultar el error original si la auditoría también falla. */
  async function recordFailure(
    event: ApiEvent,
    actorSub: string,
    action: AuditAction,
    resourceRef: string,
    error: unknown,
  ): Promise<void> {
    try {
      await deps.audit.record(
        buildAuditEvent({
          requestId: event.requestContext.requestId,
          actorSub,
          action,
          resourceRef,
          outcome: outcomeFromError(error),
          now: now(),
        }),
      );
    } catch {
      process.stderr.write(
        `${JSON.stringify({ level: 'error', msg: 'audit_write_failed', action, requestId: event.requestContext.requestId })}\n`,
      );
    }
  }

  return {
    /** GET /v1/projects — catálogo público, solo PUBLICADO (HU-01, CA-01.1–01.3, T01). */
    async list(event: ApiEvent): Promise<HttpResponse> {
      const requestId = event.requestContext.requestId;
      try {
        const projects = await deps.projects.listPublished();
        // Defensa en profundidad: aunque el índice ya filtra, nunca se devuelve un BORRADOR.
        const items = projects.filter((p) => p.status === 'PUBLICADO').map(toPublicProject);
        return json(200, { items });
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },

    /** GET /v1/projects/{projectId} — detalle público (HU-02). */
    async get(event: ApiEvent): Promise<HttpResponse> {
      const requestId = event.requestContext.requestId;
      try {
        return json(200, toPublicProject(await getPublished(event)));
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },

    /** GET /v1/projects/{projectId}/stats — solo montos confirmados (HU-09, CA-09.1, CA-09.2). */
    async stats(event: ApiEvent): Promise<HttpResponse> {
      const requestId = event.requestContext.requestId;
      try {
        const project = await getPublished(event);
        const stats: ProjectStats = {
          projectId: project.projectId,
          goalAmountCents: project.goalAmountCents,
          confirmedAmountCents: project.confirmedAmountCents,
          currency: project.currency,
        };
        return json(200, stats);
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },

    /** POST /v1/projects — solo GESTOR, nace en BORRADOR (HU-08, CA-08.1, CA-08.3, T03). */
    async create(event: ApiEvent): Promise<HttpResponse> {
      const requestId = event.requestContext.requestId;
      let actorSub: string | undefined;
      let resourceRef = 'project:new';
      try {
        const principal = getPrincipal(event);
        actorSub = principal.sub;
        requireScope(principal, PROJECTS_WRITE_SCOPE);
        requireGroup(principal, 'GESTOR');

        const body = parseOrThrow(CreateProjectBodySchema, parseJsonBody(event));
        const timestamp = now();
        const project: Project = {
          projectId: newId(),
          title: body.title,
          description: body.description,
          goalAmountCents: body.goalAmountCents,
          confirmedAmountCents: 0,
          currency: 'PEN',
          status: 'BORRADOR',
          createdAt: timestamp.toISOString(),
          updatedAt: timestamp.toISOString(),
        };
        resourceRef = `project:${project.projectId}`;

        const audit = buildAuditEvent({
          requestId,
          actorSub,
          action: 'PROJECT_CREATE',
          resourceRef,
          outcome: 'SUCCESS',
          now: timestamp,
        });
        await deps.projects.create(project, audit);
        return json(201, toPublicProject(project));
      } catch (error) {
        if (actorSub !== undefined) {
          await recordFailure(event, actorSub, 'PROJECT_CREATE', resourceRef, error);
        }
        return errorResponse(error, requestId);
      }
    },

    /** PATCH /v1/projects/{projectId}/publish — solo GESTOR; 409 si ya está publicado (CA-08.2, CA-08.3). */
    async publish(event: ApiEvent): Promise<HttpResponse> {
      const requestId = event.requestContext.requestId;
      let actorSub: string | undefined;
      let resourceRef = 'project:unknown';
      try {
        const principal = getPrincipal(event);
        actorSub = principal.sub;
        requireScope(principal, PROJECTS_WRITE_SCOPE);
        requireGroup(principal, 'GESTOR');

        const projectId = uuidPathParam(event, 'projectId');
        resourceRef = `project:${projectId}`;
        const timestamp = now();
        const audit = buildAuditEvent({
          requestId,
          actorSub,
          action: 'PROJECT_PUBLISH',
          resourceRef,
          outcome: 'SUCCESS',
          now: timestamp,
        });
        const published = await deps.projects.publish(projectId, timestamp.toISOString(), audit);
        return json(200, toPublicProject(published));
      } catch (error) {
        if (actorSub !== undefined) {
          await recordFailure(event, actorSub, 'PROJECT_PUBLISH', resourceRef, error);
        }
        return errorResponse(error, requestId);
      }
    },
  };
}

export type ProjectHandlers = ReturnType<typeof makeProjectHandlers>;
