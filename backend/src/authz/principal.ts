import { AppError } from '../shared/errors.js';

/**
 * Identidad verificada del solicitante (contrato #5 del plan).
 * Se construye SOLO a partir de claims que ya validó el JWT authorizer de API Gateway
 * (PEP). Nunca a partir de headers, query o body enviados por el cliente (CA-04.3).
 */
export const GROUPS = ['DONANTE', 'GESTOR', 'AUDITOR'] as const;
export type Group = (typeof GROUPS)[number];

export interface Principal {
  sub: string;
  groups: Group[];
  scopes: string[];
  clientId: string;
}

/** Forma mínima del evento de HTTP API (payload v2) que necesitamos. */
export interface JwtAuthorizedEvent {
  requestContext: {
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown>;
        scopes?: string[] | null;
      };
    };
  };
}

/**
 * Los claims tipo lista pueden llegar como arreglo o como string.
 * API Gateway HTTP API suele aplanar `cognito:groups` como "[GESTOR DONANTE]"
 * y `scope` es una lista separada por espacios: "api/donations.write api/donations.read".
 */
export function parseListClaim(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
  }
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .trim()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(/[\s,]+/)
    .filter((item) => item.length > 0);
}

function isGroup(value: string): value is Group {
  return (GROUPS as readonly string[]).includes(value);
}

export function getPrincipal(event: JwtAuthorizedEvent): Principal {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  if (!claims) {
    throw new AppError('UNAUTHENTICATED', 'Autenticación requerida');
  }

  const sub = claims['sub'];
  const clientId = claims['client_id'];
  const tokenUse = claims['token_use'];

  // Defensa en profundidad: además del authorizer, exigimos un access token de Cognito.
  if (typeof sub !== 'string' || sub.length === 0 || typeof clientId !== 'string' || tokenUse !== 'access') {
    throw new AppError('UNAUTHENTICATED', 'Autenticación requerida');
  }

  const groups = parseListClaim(claims['cognito:groups']).filter(isGroup);
  const scopes = parseListClaim(claims['scope']);

  return { sub, groups, scopes, clientId };
}

export function hasGroup(principal: Principal, group: Group): boolean {
  return principal.groups.includes(group);
}

export function requireGroup(principal: Principal, group: Group): void {
  if (!hasGroup(principal, group)) {
    throw new AppError('FORBIDDEN', 'No tiene permisos para esta operación');
  }
}

/**
 * Ownership (anti-BOLA, CA-07.2): si el recurso no es del solicitante se responde 404,
 * para no revelar que existe.
 */
export function requireOwner(principal: Principal, resourceOwnerSub: string | undefined): void {
  if (resourceOwnerSub === undefined || resourceOwnerSub !== principal.sub) {
    throw new AppError('NOT_FOUND', 'Recurso no encontrado');
  }
}
