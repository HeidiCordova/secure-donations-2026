import type { AuditAction, AuditEvent } from './audit.js';

/** Clave de continuación de DynamoDB para la tabla AuditEvents (PK eventType, SK sk). */
export interface AuditPageKey {
  eventType: string;
  sk: string;
}

export interface AuditQuery {
  eventType: AuditAction;
  /** ISO 8601 normalizado con milisegundos (toISOString), inclusive. */
  from?: string | undefined;
  /** ISO 8601 normalizado con milisegundos (toISOString), inclusive. */
  to?: string | undefined;
  limit: number;
  startKey?: AuditPageKey | undefined;
}

export interface AuditPage {
  items: AuditEvent[];
  nextKey?: AuditPageKey | undefined;
}

/** Lectura de eventos de auditoría por tipo y rango de fechas, más recientes primero (HU-10). */
export interface AuditReader {
  query(query: AuditQuery): Promise<AuditPage>;
}
