import { toErrorBody } from './errors.js';
import { json, type HttpResponse } from './http.js';

/**
 * Log JSON por solicitud (CA-NF07.1): requestId, acción, resultado, código HTTP y duración.
 * Nunca se registran tokens, claims, `sub`, cuerpos de solicitud ni de respuesta (CA-NF01.2, CA-NF07.2).
 */
export type LogOutcome = 'SUCCESS' | 'INVALID' | 'DENIED' | 'NOT_FOUND' | 'CONFLICT' | 'ERROR';

export interface RequestLog {
  level: 'info' | 'warn' | 'error';
  timestamp: string;
  requestId: string;
  action: string;
  routeKey?: string;
  outcome: LogOutcome;
  statusCode: number;
  durationMs: number;
  /** Código de error del cuerpo uniforme (por ejemplo IDEMPOTENCY_MISMATCH); nunca el mensaje ni los datos. */
  errorCode?: string;
}

export interface LoggingDeps {
  write?: (line: string) => void;
  clock?: () => number;
}

/** Forma mínima que necesita el logger; `routeKey` es el patrón de la ruta, sin IDs (p. ej. "GET /v1/projects/{projectId}"). */
interface LoggableEvent {
  requestContext: { requestId: string };
  routeKey?: string | undefined;
}

export function outcomeFromStatus(statusCode: number): LogOutcome {
  if (statusCode < 400) return 'SUCCESS';
  if (statusCode === 400) return 'INVALID';
  if (statusCode === 401 || statusCode === 403 || statusCode === 429) return 'DENIED';
  if (statusCode === 404) return 'NOT_FOUND';
  if (statusCode === 409) return 'CONFLICT';
  return 'ERROR';
}

function levelFromStatus(statusCode: number): RequestLog['level'] {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

/** Solo lee el campo `code` del error uniforme { code, message, requestId }. */
function errorCodeOf(response: HttpResponse): string | undefined {
  if (response.statusCode < 400) return undefined;
  try {
    const code = (JSON.parse(response.body) as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

const defaultWrite = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

/**
 * Envuelve un handler para escribir exactamente una línea JSON por solicitud.
 * Si el handler lanzara un error no controlado, se registra y se responde 500 genérico.
 */
export function withLogging<E extends LoggableEvent>(
  action: string,
  handler: (event: E) => Promise<HttpResponse>,
  deps: LoggingDeps = {},
): (event: E) => Promise<HttpResponse> {
  const write = deps.write ?? defaultWrite;
  const clock = deps.clock ?? (() => performance.now());

  return async (event: E) => {
    const started = clock();
    const requestId = event.requestContext.requestId;
    let response: HttpResponse;
    try {
      response = await handler(event);
    } catch {
      const { statusCode, body } = toErrorBody(undefined, requestId);
      response = json(statusCode, body);
    }
    const entry: RequestLog = {
      level: levelFromStatus(response.statusCode),
      timestamp: new Date().toISOString(),
      requestId,
      action,
      outcome: outcomeFromStatus(response.statusCode),
      statusCode: response.statusCode,
      durationMs: Math.round(clock() - started),
    };
    if (event.routeKey !== undefined) entry.routeKey = event.routeKey;
    const errorCode = errorCodeOf(response);
    if (errorCode !== undefined) entry.errorCode = errorCode;
    try {
      write(JSON.stringify(entry));
    } catch {
      // un fallo del log nunca debe cambiar la respuesta
    }
    return response;
  };
}
