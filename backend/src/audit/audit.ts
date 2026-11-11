import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../shared/errors.js';

/**
 * Eventos de auditoría (CA-08.3, CA-10.2): actor seudonimizado, fecha, acción, recurso y resultado.
 * Nunca se guardan tokens, claves, cuerpos de solicitud ni datos financieros.
 */
export const AUDIT_ACTIONS = [
  'PROJECT_CREATE',
  'PROJECT_PUBLISH',
  'DONATION_CREATE',
  'DONATION_SIMULATE',
  'DONATION_FLAGGED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export const AUDIT_OUTCOMES = ['SUCCESS', 'DENIED', 'INVALID', 'NOT_FOUND', 'CONFLICT', 'ERROR'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  requestId: string;
  actorRef: string;
  action: AuditAction;
  resourceRef: string;
  outcome: AuditOutcome;
}

/** Registro de auditoría para intentos fallidos (los exitosos se escriben en la misma transacción). */
export interface AuditLog {
  record(event: AuditEvent): Promise<void>;
}

/** Seudónimo estable del actor: permite correlacionar sin exponer el `sub` de Cognito. */
export function pseudonymize(sub: string): string {
  return `actor_${createHash('sha256').update(`aqp-solidaria:${sub}`).digest('hex').slice(0, 16)}`;
}

export function outcomeFromError(error: unknown): AuditOutcome {
  if (!(error instanceof AppError)) {
    return 'ERROR';
  }
  switch (error.code) {
    case 'UNAUTHENTICATED':
    case 'FORBIDDEN':
    case 'RATE_LIMITED':
      return 'DENIED';
    case 'VALIDATION_ERROR':
      return 'INVALID';
    case 'NOT_FOUND':
      return 'NOT_FOUND';
    case 'CONFLICT':
    case 'INVALID_TRANSITION':
    case 'IDEMPOTENCY_MISMATCH':
      return 'CONFLICT';
    default:
      return 'ERROR';
  }
}

export interface AuditInput {
  requestId: string;
  actorSub: string;
  action: AuditAction;
  resourceRef: string;
  outcome: AuditOutcome;
  now: Date;
}

export function buildAuditEvent(input: AuditInput): AuditEvent {
  return {
    eventId: randomUUID(),
    timestamp: input.now.toISOString(),
    requestId: input.requestId,
    actorRef: pseudonymize(input.actorSub),
    action: input.action,
    resourceRef: input.resourceRef,
    outcome: input.outcome,
  };
}
