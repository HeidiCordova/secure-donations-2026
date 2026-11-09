import { randomUUID } from 'node:crypto';
import { buildAuditEvent, outcomeFromError, type AuditAction, type AuditLog } from '../audit/audit.js';
import { getPrincipal, requireGroup, requireOwner, requireScope } from '../authz/principal.js';
import { AppError } from '../shared/errors.js';
import { getHeader, parseJsonBody, uuidPathParam, type ApiEvent } from '../shared/event.js';
import { errorResponse, json, type HttpResponse } from '../shared/http.js';
import {
  CreateDonationBodySchema,
  IdempotencyKeySchema,
  SimulateDonationBodySchema,
  type Donation,
} from '../shared/schemas.js';
import { parseOrThrow } from '../shared/validation.js';
import { expiresAtFrom, idempotencyPk, payloadHash, type IdempotencyRecord } from './idempotency.js';
import type { DonationRepository } from './repository.js';

export const DONATIONS_WRITE_SCOPE = 'api/donations.write';
export const DONATIONS_READ_SCOPE = 'api/donations.read';

export interface DonationDeps {
  donations: DonationRepository;
  audit: AuditLog;
  now?: () => Date;
  newId?: () => string;
  /** Stage de despliegue; la simulación solo existe en `academic` (CA-06.1). */
  stage?: string | undefined;
}

/**
 * Vista de una donación para su propio donante: campo por campo, sin atributos internos.
 * No incluye `donorSub`: el cliente ya sabe quién es y así el identificador de Cognito
 * no viaja en las respuestas (minimización de datos, CA-NF10.1).
 */
export type DonationView = Omit<Donation, 'donorSub'>;

export function toDonationView(donation: Donation): DonationView {
  return {
    donationId: donation.donationId,
    projectId: donation.projectId,
    amountCents: donation.amountCents,
    currency: donation.currency,
    status: donation.status,
    createdAt: donation.createdAt,
    updatedAt: donation.updatedAt,
  };
}

/** Repite exactamente la respuesta guardada, o 409 si la clave se reutiliza con otro body (CA-05.4, T06, T07). */
function replay(record: IdempotencyRecord, hash: string): HttpResponse {
  if (record.payloadHash !== hash) {
    throw new AppError('IDEMPOTENCY_MISMATCH', 'La clave de idempotencia ya se usó con otra solicitud');
  }
  return {
    statusCode: record.responseStatus,
    headers: { 'content-type': 'application/json; charset=utf-8', 'idempotent-replayed': 'true' },
    body: record.responseBody,
  };
}

export function makeDonationHandlers(deps: DonationDeps) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => randomUUID());

  async function recordFailure(
    event: ApiEvent,
    actorSub: string,
    resourceRef: string,
    error: unknown,
    action: AuditAction = 'DONATION_CREATE',
  ) {
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

  /** Solo el DONANTE dueño de la identidad verificada (CA-04.3, CA-05.3). */
  function donorPrincipal(event: ApiEvent, scope: string) {
    const principal = getPrincipal(event);
    requireScope(principal, scope);
    requireGroup(principal, 'DONANTE');
    return principal;
  }

  return {
    /** POST /v1/donations — intención de donación simulada con idempotencia atómica (HU-05, T04–T07). */
    async create(event: ApiEvent): Promise<HttpResponse> {
      const requestId = event.requestContext.requestId;
      let actorSub: string | undefined;
      let resourceRef = 'donation:new';
      try {
        const principal = getPrincipal(event);
        actorSub = principal.sub;
        requireScope(principal, DONATIONS_WRITE_SCOPE);
        requireGroup(principal, 'DONANTE');

        const idempotencyKey = parseOrThrow(IdempotencyKeySchema, getHeader(event, 'idempotency-key'));
        const body = parseOrThrow(CreateDonationBodySchema, parseJsonBody(event));
        const pk = idempotencyPk(principal.sub, idempotencyKey);
        const hash = payloadHash(body);

        // 1) Reintento de la misma clave: se responde lo guardado sin volver a validar el proyecto.
        const existing = await deps.donations.getIdempotencyRecord(pk);
        if (existing !== undefined) {
          return replay(existing, hash);
        }

        // 2) El proyecto debe existir (404) y estar PUBLICADO (409) (CA-05.2).
        const projectId = body.projectId.toLowerCase();
        const project = await deps.donations.getProject(projectId);
        if (project === undefined) {
          throw new AppError('NOT_FOUND', 'Recurso no encontrado');
        }
        if (project.status !== 'PUBLICADO') {
          throw new AppError('CONFLICT', 'El proyecto no acepta donaciones');
        }

        // 3) Clave + donación + AuditEvent en una sola transacción condicionada (AD-05, CA-05.4).
        const timestamp = now();
        const donation: Donation = {
          donationId: newId(),
          projectId,
          donorSub: principal.sub, // siempre del token, nunca del body (CA-05.3)
          amountCents: body.amountCents,
          currency: 'PEN',
          status: 'PENDIENTE_SIMULACION',
          createdAt: timestamp.toISOString(),
          updatedAt: timestamp.toISOString(),
        };
        resourceRef = `donation:${donation.donationId}`;
        const responseBody = JSON.stringify(toDonationView(donation));
        const record: IdempotencyRecord = {
          pk,
          payloadHash: hash,
          donationId: donation.donationId,
          responseStatus: 201,
          responseBody,
          expiresAt: expiresAtFrom(timestamp),
          createdAt: timestamp.toISOString(),
        };
        const audit = buildAuditEvent({
          requestId,
          actorSub: principal.sub,
          action: 'DONATION_CREATE',
          resourceRef,
          outcome: 'SUCCESS',
          now: timestamp,
        });

        const result = await deps.donations.createDonation({ record, donation, audit });
        if (result === 'KEY_EXISTS') {
          // Otra solicitud con la misma clave ganó la carrera: se lee con ConsistentRead y se repite.
          const winner = await deps.donations.getIdempotencyRecord(pk);
          if (winner === undefined) {
            throw new AppError('CONFLICT', 'Solicitud concurrente, reintente');
          }
          return replay(winner, hash);
        }
        return { statusCode: 201, headers: { 'content-type': 'application/json; charset=utf-8' }, body: responseBody };
      } catch (error) {
        if (actorSub !== undefined) {
          await recordFailure(event, actorSub, resourceRef, error);
        }
        return errorResponse(error, requestId);
      }
    },

    /** GET /v1/donations/me — solo las donaciones del `sub` autenticado (HU-07, CA-07.1). */
    async listMine(event: ApiEvent): Promise<HttpResponse> {
      const requestId = event.requestContext.requestId;
      try {
        const principal = donorPrincipal(event, DONATIONS_READ_SCOPE);
        const donations = await deps.donations.listByDonor(principal.sub);
        // Defensa en profundidad: aunque el índice ya filtra por donorSub, nunca se devuelve una ajena.
        const items = donations.filter((d) => d.donorSub === principal.sub).map(toDonationView);
        return json(200, { items });
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },

    /**
     * POST /v1/donations/{donationId}/simulate — solo stage `academic`, solo el DONANTE dueño (HU-06).
     * Solo la primera transición válida cambia el total; las repetidas o concurrentes reciben 409 (CA-06.2, T08).
     * Una rechazada no incrementa nada (CA-06.3).
     */
    async simulate(event: ApiEvent): Promise<HttpResponse> {
      const requestId = event.requestContext.requestId;
      let actorSub: string | undefined;
      let resourceRef = 'donation:unknown';
      try {
        // Defensa en profundidad: la plantilla solo crea la ruta en academic; aquí se vuelve a comprobar.
        if (deps.stage !== 'academic') {
          throw new AppError('NOT_FOUND', 'Recurso no encontrado');
        }
        const principal = getPrincipal(event);
        actorSub = principal.sub;
        requireScope(principal, DONATIONS_WRITE_SCOPE);
        requireGroup(principal, 'DONANTE');

        const donationId = uuidPathParam(event, 'donationId');
        resourceRef = `donation:${donationId}`;
        const { outcome } = parseOrThrow(SimulateDonationBodySchema, parseJsonBody(event));

        const donation = await deps.donations.getDonation(donationId);
        if (donation === undefined) {
          throw new AppError('NOT_FOUND', 'Recurso no encontrado');
        }
        requireOwner(principal, donation.donorSub);
        if (donation.status !== 'PENDIENTE_SIMULACION') {
          throw new AppError('INVALID_TRANSITION', 'La donación ya no está pendiente');
        }

        const timestamp = now();
        const audit = buildAuditEvent({
          requestId,
          actorSub: principal.sub,
          action: 'DONATION_SIMULATE',
          resourceRef,
          outcome: 'SUCCESS',
          now: timestamp,
        });
        const updated = await deps.donations.simulateDonation({
          donation,
          outcome,
          updatedAt: timestamp.toISOString(),
          audit,
        });
        // Mismo contrato que docs/api.yaml (200 Donation). El aviso de CA-06.4 lo muestra la UI.
        return json(200, toDonationView(updated));
      } catch (error) {
        if (actorSub !== undefined) {
          await recordFailure(event, actorSub, resourceRef, error, 'DONATION_SIMULATE');
        }
        return errorResponse(error, requestId);
      }
    },

    /** GET /v1/donations/{donationId} — solo el dueño; una ajena responde 404 (anti-BOLA, CA-07.2, T09). */
    async get(event: ApiEvent): Promise<HttpResponse> {
      const requestId = event.requestContext.requestId;
      try {
        const principal = donorPrincipal(event, DONATIONS_READ_SCOPE);
        const donationId = uuidPathParam(event, 'donationId');
        const donation = await deps.donations.getDonation(donationId);
        if (donation === undefined) {
          throw new AppError('NOT_FOUND', 'Recurso no encontrado');
        }
        // Una donación ajena responde igual que una inexistente: no se revela que existe.
        requireOwner(principal, donation.donorSub);
        return json(200, toDonationView(donation));
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },
  };
}

export type DonationHandlers = ReturnType<typeof makeDonationHandlers>;
