import { describe, expect, it } from 'vitest';
import {
  getPrincipal,
  parseListClaim,
  requireGroup,
  requireOwner,
  type JwtAuthorizedEvent,
} from '../../src/authz/principal.js';
import { AppError } from '../../src/shared/errors.js';

function eventWith(claims: Record<string, unknown> | undefined): JwtAuthorizedEvent {
  return { requestContext: { authorizer: claims ? { jwt: { claims } } : {} } };
}

const baseClaims = {
  sub: 'user-123',
  client_id: 'client-abc',
  token_use: 'access',
  scope: 'api/donations.write api/donations.read',
};

function expectAppError(fn: () => unknown, code: AppError['code']): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`Se esperaba AppError ${code}`);
}

describe('parseListClaim', () => {
  it('acepta arreglos', () => {
    expect(parseListClaim(['GESTOR', 'DONANTE'])).toEqual(['GESTOR', 'DONANTE']);
  });

  it('acepta el formato aplanado de HTTP API "[A B]"', () => {
    expect(parseListClaim('[GESTOR DONANTE]')).toEqual(['GESTOR', 'DONANTE']);
  });

  it('acepta scopes separados por espacio', () => {
    expect(parseListClaim('api/a api/b')).toEqual(['api/a', 'api/b']);
  });

  it('devuelve lista vacía ante valores ausentes o inválidos', () => {
    expect(parseListClaim(undefined)).toEqual([]);
    expect(parseListClaim(42)).toEqual([]);
    expect(parseListClaim('[]')).toEqual([]);
  });
});

describe('getPrincipal (CA-04.3)', () => {
  it('construye el principal desde claims verificados', () => {
    const principal = getPrincipal(eventWith({ ...baseClaims, 'cognito:groups': '[DONANTE]' }));
    expect(principal).toEqual({
      sub: 'user-123',
      clientId: 'client-abc',
      groups: ['DONANTE'],
      scopes: ['api/donations.write', 'api/donations.read'],
    });
  });

  it('ignora grupos desconocidos', () => {
    const principal = getPrincipal(eventWith({ ...baseClaims, 'cognito:groups': ['DONANTE', 'ADMIN'] }));
    expect(principal.groups).toEqual(['DONANTE']);
  });

  it('sin claims responde UNAUTHENTICATED', () => {
    expectAppError(() => getPrincipal(eventWith(undefined)), 'UNAUTHENTICATED');
  });

  it('rechaza un ID token aunque tenga sub (T11)', () => {
    expectAppError(() => getPrincipal(eventWith({ ...baseClaims, token_use: 'id' })), 'UNAUTHENTICATED');
  });

  it('rechaza tokens sin sub o sin client_id', () => {
    expectAppError(() => getPrincipal(eventWith({ ...baseClaims, sub: '' })), 'UNAUTHENTICATED');
    expectAppError(() => getPrincipal(eventWith({ ...baseClaims, client_id: undefined })), 'UNAUTHENTICATED');
  });
});

describe('requireGroup (CA-04.1)', () => {
  it('un DONANTE no pasa como GESTOR', () => {
    const principal = getPrincipal(eventWith({ ...baseClaims, 'cognito:groups': '[DONANTE]' }));
    expectAppError(() => requireGroup(principal, 'GESTOR'), 'FORBIDDEN');
  });

  it('un GESTOR pasa como GESTOR', () => {
    const principal = getPrincipal(eventWith({ ...baseClaims, 'cognito:groups': '[GESTOR]' }));
    expect(() => requireGroup(principal, 'GESTOR')).not.toThrow();
  });
});

describe('requireOwner (CA-07.2, anti-BOLA)', () => {
  const principal = getPrincipal(eventWith({ ...baseClaims, 'cognito:groups': '[DONANTE]' }));

  it('el dueño accede', () => {
    expect(() => requireOwner(principal, 'user-123')).not.toThrow();
  });

  it('otro usuario recibe NOT_FOUND sin revelar el recurso', () => {
    expectAppError(() => requireOwner(principal, 'user-999'), 'NOT_FOUND');
    expectAppError(() => requireOwner(principal, undefined), 'NOT_FOUND');
  });
});
