import { toErrorBody } from './errors.js';

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function json(statusCode: number, payload: unknown): HttpResponse {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  };
}

/** Respuesta de error uniforme { code, message, requestId } sin detalles internos. */
export function errorResponse(error: unknown, requestId: string): HttpResponse {
  const { statusCode, body } = toErrorBody(error, requestId);
  return json(statusCode, body);
}
