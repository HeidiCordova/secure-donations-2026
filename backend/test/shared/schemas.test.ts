import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CreateDonationBodySchema,
  CreateProjectBodySchema,
  DonationSchema,
  DonationStatusSchema,
  IdempotencyKeySchema,
  ProjectSchema,
  SimulateDonationBodySchema,
} from '../../src/shared/schemas.js';
import { parseOrThrow } from '../../src/shared/validation.js';
import { AppError } from '../../src/shared/errors.js';

const PROJECT_ID = '3f6c1a52-8d4e-4b7a-9c21-5e0f8a9b7d10';
const NOW = '2026-11-07T12:00:00.000Z';

describe('CreateDonationBodySchema (CA-05.1, CA-05.2, T04)', () => {
  it('acepta los límites 100 y 100000', () => {
    expect(CreateDonationBodySchema.safeParse({ projectId: PROJECT_ID, amountCents: 100 }).success).toBe(true);
    expect(CreateDonationBodySchema.safeParse({ projectId: PROJECT_ID, amountCents: 100000 }).success).toBe(true);
  });

  it.each([0, -100, 99, 100001, 150.5, Number.NaN, '500', null])('rechaza amountCents = %s', (amountCents) => {
    expect(CreateDonationBodySchema.safeParse({ projectId: PROJECT_ID, amountCents }).success).toBe(false);
  });

  it('rechaza projectId ausente o que no es UUID', () => {
    expect(CreateDonationBodySchema.safeParse({ amountCents: 500 }).success).toBe(false);
    expect(CreateDonationBodySchema.safeParse({ projectId: 'abc', amountCents: 500 }).success).toBe(false);
  });

  it('rechaza donorSub enviado por el cliente (CA-05.3)', () => {
    const body = { projectId: PROJECT_ID, amountCents: 500, donorSub: 'otro-usuario' };
    expect(CreateDonationBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('IdempotencyKeySchema (CA-05.4)', () => {
  it('acepta un UUID', () => {
    expect(IdempotencyKeySchema.safeParse(randomUUID()).success).toBe(true);
  });

  it.each(['', 'abc', undefined])('rechaza %s', (key) => {
    expect(IdempotencyKeySchema.safeParse(key).success).toBe(false);
  });
});

describe('CreateProjectBodySchema (CA-08.1)', () => {
  const valid = { title: 'Comedor Paucarpata', description: 'Alimentación para 50 niños', goalAmountCents: 500000 };

  it('acepta un proyecto válido', () => {
    expect(CreateProjectBodySchema.safeParse(valid).success).toBe(true);
  });

  it('rechaza objetivo cero o negativo', () => {
    expect(CreateProjectBodySchema.safeParse({ ...valid, goalAmountCents: 0 }).success).toBe(false);
    expect(CreateProjectBodySchema.safeParse({ ...valid, goalAmountCents: -1 }).success).toBe(false);
  });

  it('rechaza que el cliente fije status o montos confirmados', () => {
    expect(CreateProjectBodySchema.safeParse({ ...valid, status: 'PUBLICADO' }).success).toBe(false);
    expect(CreateProjectBodySchema.safeParse({ ...valid, confirmedAmountCents: 999 }).success).toBe(false);
  });

  it('rechaza título vacío', () => {
    expect(CreateProjectBodySchema.safeParse({ ...valid, title: '   ' }).success).toBe(false);
  });
});

describe('Entidades Project y Donation (requirements.md §4)', () => {
  const project = {
    projectId: PROJECT_ID,
    title: 'Comedor Paucarpata',
    description: 'Alimentación para 50 niños',
    goalAmountCents: 500000,
    confirmedAmountCents: 0,
    currency: 'PEN',
    status: 'BORRADOR',
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('acepta un Project válido', () => {
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it('solo acepta moneda PEN', () => {
    expect(ProjectSchema.safeParse({ ...project, currency: 'USD' }).success).toBe(false);
  });

  it('acepta una Donation válida y rechaza estados desconocidos', () => {
    const donation = {
      donationId: randomUUID(),
      projectId: PROJECT_ID,
      donorSub: 'user-123',
      amountCents: 500,
      currency: 'PEN',
      status: 'PENDIENTE_SIMULACION',
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(DonationSchema.safeParse(donation).success).toBe(true);
    expect(DonationStatusSchema.safeParse('PAGADA').success).toBe(false);
  });
});

describe('SimulateDonationBodySchema (CA-06.1)', () => {
  it('acepta solo estados terminales', () => {
    expect(SimulateDonationBodySchema.safeParse({ outcome: 'CONFIRMADA_SIMULADA' }).success).toBe(true);
    expect(SimulateDonationBodySchema.safeParse({ outcome: 'RECHAZADA_SIMULADA' }).success).toBe(true);
    expect(SimulateDonationBodySchema.safeParse({ outcome: 'PENDIENTE_SIMULACION' }).success).toBe(false);
  });
});

describe('parseOrThrow', () => {
  it('devuelve los datos validados', () => {
    expect(parseOrThrow(CreateDonationBodySchema, { projectId: PROJECT_ID, amountCents: 500 })).toEqual({
      projectId: PROJECT_ID,
      amountCents: 500,
    });
  });

  it('lanza VALIDATION_ERROR (400) sin repetir el input', () => {
    try {
      parseOrThrow(CreateDonationBodySchema, { projectId: PROJECT_ID, amountCents: 'secreto-123' });
      throw new Error('Se esperaba AppError');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(400);
      expect((error as AppError).message).not.toContain('secreto-123');
    }
  });
});
