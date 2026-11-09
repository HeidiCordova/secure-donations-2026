import { z } from 'zod';
import { getPrincipal, requireGroup, requireScope } from '../authz/principal.js';
import { AppError } from '../shared/errors.js';
import type { ApiEvent } from '../shared/event.js';
import { errorResponse, json, type HttpResponse } from '../shared/http.js';
import { parseOrThrow } from '../shared/validation.js';
import { AUDIT_ACTIONS } from './audit.js';
import type { AuditPageKey, AuditReader } from './reader.js';

export const AUDIT_READ_SCOPE = 'api/audit.read';
export const DEFAULT_AUDIT_LIMIT = 50;
export const MAX_AUDIT_LIMIT = 100;

/**
 * Filtros de GET /v1/audit (CA-10.1). strictObject: un parámetro desconocido responde 400.
 * `type` es obligatorio porque la tabla se particiona por tipo de evento (design.md §5).
 */
const AuditQuerySchema = z.strictObject({
  type: z.enum(AUDIT_ACTIONS),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_AUDIT_LIMIT).optional(),
  nextToken: z.string().min(1).max(2048).optional(),
});

/**
 * Normaliza a `toISOString()` (con milisegundos y en UTC), igual que los timestamps guardados,
 * para que la comparación de texto del sort key sea correcta.
 */
function normalizeDate(value: string | undefined): string | undefined {
  return value === undefined ? undefined : new Date(value).toISOString();
}

export function encodeNextToken(key: AuditPageKey): string {
  return Buffer.from(JSON.stringify({ eventType: key.eventType, sk: key.sk }), 'utf8').toString('base64url');
}

/**
 * El token viene del cliente: se valida su forma y que pertenezca al mismo tipo consultado,
 * para no aceptar claves arbitrarias en ExclusiveStartKey.
 */
export function decodeNextToken(token: string | undefined, eventType: string): AuditPageKey | undefined {
  if (token === undefined) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as Record<string, unknown>)['eventType'] === eventType &&
      typeof (parsed as Record<string, unknown>)['sk'] === 'string'
    ) {
      return { eventType, sk: (parsed as Record<string, string>)['sk'] as string };
    }
  } catch {
    // se trata abajo como token inválido
  }
  throw new AppError('VALIDATION_ERROR', 'Solicitud inválida');
}

export function makeAuditHandlers(deps: { reader: AuditReader }) {
  return {
    /** GET /v1/audit — solo AUDITOR (con MFA en Cognito) y scope api/audit.read (HU-10, CA-10.1, CA-10.2). */
    async list(event: ApiEvent): Promise<HttpResponse> {
      const requestId = event.requestContext.requestId;
      try {
        const principal = getPrincipal(event);
        requireScope(principal, AUDIT_READ_SCOPE);
        requireGroup(principal, 'AUDITOR');

        const params = parseOrThrow(AuditQuerySchema, event.queryStringParameters ?? {});
        const from = normalizeDate(params.from);
        const to = normalizeDate(params.to);
        if (from !== undefined && to !== undefined && from > to) {
          throw new AppError('VALIDATION_ERROR', 'Solicitud inválida');
        }

        const page = await deps.reader.query({
          eventType: params.type,
          from,
          to,
          limit: params.limit ?? DEFAULT_AUDIT_LIMIT,
          startKey: decodeNextToken(params.nextToken, params.type),
        });
        return json(200, {
          items: page.items,
          ...(page.nextKey === undefined ? {} : { nextToken: encodeNextToken(page.nextKey) }),
        });
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },
  };
}
