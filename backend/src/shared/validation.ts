import { z } from 'zod';
import { AppError } from './errors.js';

/**
 * Valida datos no confiables del cliente. Si fallan, lanza VALIDATION_ERROR (HTTP 400)
 * con un mensaje genérico: no se devuelven los valores recibidos ni detalles internos.
 */
export function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 'Solicitud inválida');
  }
  return result.data;
}
