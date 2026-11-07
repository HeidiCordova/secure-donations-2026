import { z } from 'zod';

/**
 * Esquemas de dominio compartidos frontend/backend (design.md §2, requirements.md §4).
 * Dinero siempre en céntimos enteros de PEN; nunca float (AD-04).
 */
export const CURRENCY = 'PEN' as const;
export const MIN_DONATION_CENTS = 100; // S/ 1.00
export const MAX_DONATION_CENTS = 100_000; // S/ 1,000.00

export const ProjectStatusSchema = z.enum(['BORRADOR', 'PUBLICADO']);
export const DonationStatusSchema = z.enum(['PENDIENTE_SIMULACION', 'CONFIRMADA_SIMULADA', 'RECHAZADA_SIMULADA']);

const IsoDateTime = z.iso.datetime();
const Currency = z.literal(CURRENCY);

/** Entidad Project (requirements.md §4). */
export const ProjectSchema = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  goalAmountCents: z.int().positive(),
  confirmedAmountCents: z.int().nonnegative(),
  currency: Currency,
  status: ProjectStatusSchema,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

/** Entidad Donation (requirements.md §4). */
export const DonationSchema = z.object({
  donationId: z.uuid(),
  projectId: z.uuid(),
  donorSub: z.string().min(1),
  amountCents: z.int().min(MIN_DONATION_CENTS).max(MAX_DONATION_CENTS),
  currency: Currency,
  status: DonationStatusSchema,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

/**
 * Body de POST /v1/projects (CA-08.1). strictObject: rechaza campos extra
 * como `status` o `confirmedAmountCents`; el estado inicial lo fija el servidor.
 */
export const CreateProjectBodySchema = z.strictObject({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  goalAmountCents: z.int().positive(),
});

/**
 * Body de POST /v1/donations (CA-05.1, CA-05.2, CA-05.3).
 * amountCents entero 100–100000, sin coerción de strings.
 * strictObject: un `donorSub` enviado por el cliente se rechaza (400).
 */
export const CreateDonationBodySchema = z.strictObject({
  projectId: z.uuid(),
  amountCents: z.int().min(MIN_DONATION_CENTS).max(MAX_DONATION_CENTS),
});

/** Cabecera Idempotency-Key (CA-05.1, CA-05.4). */
export const IdempotencyKeySchema = z.uuid();

/** Body de POST /v1/donations/{donationId}/simulate (CA-06.1): solo estados terminales. */
export const SimulateDonationBodySchema = z.strictObject({
  outcome: z.enum(['CONFIRMADA_SIMULADA', 'RECHAZADA_SIMULADA']),
});

/** Vista pública de agregados (HU-09): sin identificadores de donantes. */
export const ProjectStatsSchema = z.object({
  projectId: z.uuid(),
  goalAmountCents: z.int().positive(),
  confirmedAmountCents: z.int().nonnegative(),
  currency: Currency,
});

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type DonationStatus = z.infer<typeof DonationStatusSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Donation = z.infer<typeof DonationSchema>;
export type CreateProjectBody = z.infer<typeof CreateProjectBodySchema>;
export type CreateDonationBody = z.infer<typeof CreateDonationBodySchema>;
export type SimulateDonationBody = z.infer<typeof SimulateDonationBodySchema>;
export type ProjectStats = z.infer<typeof ProjectStatsSchema>;
