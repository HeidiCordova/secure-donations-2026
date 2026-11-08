import { createHash } from 'node:crypto';
import type { CreateDonationBody } from '../shared/schemas.js';

/** 24 horas de vida para la clave (design.md §5). */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 3600;

/** Registro de idempotencia (requirements.md §4). La respuesta se guarda para repetirla igual (CA-05.4). */
export interface IdempotencyRecord {
  pk: string;
  payloadHash: string;
  donationId: string;
  responseStatus: number;
  responseBody: string;
  /** Epoch en segundos: el TTL de DynamoDB no acepta fechas ISO. */
  expiresAt: number;
  createdAt: string;
}

/** Una clave por usuario y operación (invariante de requirements.md §4). */
export function idempotencyPk(donorSub: string, idempotencyKey: string): string {
  return `${donorSub}#createDonation#${idempotencyKey.toLowerCase()}`;
}

/** SHA-256 del body ya validado, con orden de campos fijo para que el mismo contenido dé el mismo hash. */
export function payloadHash(body: CreateDonationBody): string {
  const normalized = JSON.stringify({ projectId: body.projectId.toLowerCase(), amountCents: body.amountCents });
  return createHash('sha256').update(normalized).digest('hex');
}

export function expiresAtFrom(now: Date): number {
  return Math.floor(now.getTime() / 1000) + IDEMPOTENCY_TTL_SECONDS;
}
