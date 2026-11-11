import { describe, expect, it } from 'vitest';
import { buildAuditEvent, outcomeFromError, pseudonymize } from '../../src/audit/audit.js';
import { toAuditItem } from '../../src/audit/dynamo-audit-log.js';
import { AppError } from '../../src/shared/errors.js';

describe('audit', () => {
  it('el seudónimo es estable y no contiene el sub', () => {
    expect(pseudonymize('user-123')).toBe(pseudonymize('user-123'));
    expect(pseudonymize('user-123')).not.toBe(pseudonymize('user-456'));
    expect(pseudonymize('user-123')).not.toContain('user-123');
    expect(pseudonymize('user-123')).toMatch(/^actor_[0-9a-f]{16}$/);
  });

  it.each([
    [new AppError('FORBIDDEN', 'x'), 'DENIED'],
    [new AppError('RATE_LIMITED', 'x'), 'DENIED'],
    [new AppError('VALIDATION_ERROR', 'x'), 'INVALID'],
    [new AppError('NOT_FOUND', 'x'), 'NOT_FOUND'],
    [new AppError('CONFLICT', 'x'), 'CONFLICT'],
    [new Error('x'), 'ERROR'],
  ])('mapea %s a %s', (error, outcome) => {
    expect(outcomeFromError(error)).toBe(outcome);
  });

  it('el item de DynamoDB usa PK eventType y SK timestamp#eventId (design.md §5)', () => {
    const event = buildAuditEvent({
      requestId: 'req-1',
      actorSub: 'user-123',
      action: 'PROJECT_CREATE',
      resourceRef: 'project:abc',
      outcome: 'SUCCESS',
      now: new Date('2026-11-08T10:00:00.000Z'),
    });
    const item = toAuditItem(event);
    expect(item['eventType']).toBe('PROJECT_CREATE');
    expect(item['sk']).toBe(`2026-11-08T10:00:00.000Z#${event.eventId}`);
  });
});
