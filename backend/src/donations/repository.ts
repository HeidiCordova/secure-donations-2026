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

/** Estados terminales permitidos (SimulateDonationBodySchema). */
export type SimulationOutcome = 'CONFIRMADA_SIMULADA' | 'RECHAZADA_SIMULADA';

export interface SimulateDonationWrite {
  donation: Donation;
  outcome: SimulationOutcome;
  updatedAt: string;
  audit: AuditEvent;
}

export interface DonationRepository {
  getIdempotencyRecord(pk: string): Promise<IdempotencyRecord | undefined>;
  getProject(projectId: string): Promise<Project | undefined>;
  /** Lanza CONFLICT si el proyecto dejó de estar PUBLICADO o si hubo conflicto de transacción. */
  createDonation(write: CreateDonationWrite): Promise<CreateDonationResult>;
  /** Donaciones del donante, más recientes primero (GSI donorSub-createdAt). */
  listByDonor(donorSub: string): Promise<Donation[]>;
  /** Donaciones del donante creadas desde `sinceIso` (inclusive), para los límites anti-fraude. */
  listByDonorSince(donorSub: string, sinceIso: string): Promise<Donation[]>;
  getDonation(donationId: string): Promise<Donation | undefined>;
  /**
   * PENDIENTE_SIMULACION → estado terminal, en una sola transacción (CA-06.2, RNF-HU-04):
   * update condicionado de la donación + incremento del proyecto (solo si se confirma) + AuditEvent.
   * Lanza INVALID_TRANSITION si la donación ya no está pendiente, también ante solicitudes concurrentes.
   */
  simulateDonation(write: SimulateDonationWrite): Promise<Donation>;
}
