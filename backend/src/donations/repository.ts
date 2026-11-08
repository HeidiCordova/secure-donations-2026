import type { AuditEvent } from '../audit/audit.js';
import type { Donation, Project } from '../shared/schemas.js';
import type { IdempotencyRecord } from './idempotency.js';

export interface CreateDonationWrite {
  record: IdempotencyRecord;
  donation: Donation;
  audit: AuditEvent;
}

/**
 * Resultado de la escritura atómica (AD-05, CA-05.4):
 * - CREATED: se escribieron juntos el registro de la clave, la donación y el AuditEvent.
 * - KEY_EXISTS: otra solicitud con la misma clave ganó la carrera; no se escribió nada.
 */
export type CreateDonationResult = 'CREATED' | 'KEY_EXISTS';

export interface DonationRepository {
  getIdempotencyRecord(pk: string): Promise<IdempotencyRecord | undefined>;
  getProject(projectId: string): Promise<Project | undefined>;
  /** Lanza CONFLICT si el proyecto dejó de estar PUBLICADO o si hubo conflicto de transacción. */
  createDonation(write: CreateDonationWrite): Promise<CreateDonationResult>;
  /** Donaciones del donante, más recientes primero (GSI donorSub-createdAt). */
  listByDonor(donorSub: string): Promise<Donation[]>;
  getDonation(donationId: string): Promise<Donation | undefined>;
}
