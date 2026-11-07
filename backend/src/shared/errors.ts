/**
 * Catálogo de errores uniforme: { code, message, requestId } (design.md §4).
 * Nunca incluir detalles internos, stack traces ni datos sensibles en `message`.
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IDEMPOTENCY_MISMATCH'
  | 'INVALID_TRANSITION'
  | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  IDEMPOTENCY_MISMATCH: 409,
  INVALID_TRANSITION: 409,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
  }
}

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  requestId: string;
}

export function toErrorBody(error: unknown, requestId: string): { statusCode: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return { statusCode: error.statusCode, body: { code: error.code, message: error.message, requestId } };
  }
  return {
    statusCode: 500,
    body: { code: 'INTERNAL_ERROR', message: 'Error interno', requestId },
  };
}
