import type { JwtAuthorizedEvent } from '../authz/principal.js';
import { AppError } from './errors.js';

/** Forma mínima del evento de API Gateway HTTP API (payload v2) que usan los handlers. */
export interface ApiEvent extends JwtAuthorizedEvent {
  requestContext: JwtAuthorizedEvent['requestContext'] & { requestId: string };
  pathParameters?: Record<string, string | undefined> | undefined;
  queryStringParameters?: Record<string, string | undefined> | undefined;
  /** HTTP API entrega los nombres de cabecera en minúsculas. */
  headers?: Record<string, string | undefined> | undefined;
  body?: string | null | undefined;
  isBase64Encoded?: boolean | undefined;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lee un identificador de la ruta. Si falta o no es UUID se responde 404 (no 400),
 * para no dar pistas sobre qué identificadores existen (CA-02.2).
 */
export function uuidPathParam(event: ApiEvent, name: string): string {
  const value = event.pathParameters?.[name];
  if (value === undefined || !UUID_PATTERN.test(value)) {
    throw new AppError('NOT_FOUND', 'Recurso no encontrado');
  }
  return value.toLowerCase();
}

/** Parsea el body JSON. Un body ausente o mal formado responde 400 sin repetir su contenido. */
export function parseJsonBody(event: ApiEvent): unknown {
  if (event.body === undefined || event.body === null || event.body === '') {
    throw new AppError('VALIDATION_ERROR', 'Solicitud inválida');
  }
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Solicitud inválida');
  }
}

/** Lee una cabecera sin distinguir mayúsculas (HTTP API las normaliza a minúsculas). */
export function getHeader(event: ApiEvent, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (key.toLowerCase() === wanted) {
      return value;
    }
  }
  return undefined;
}
