import { describe, expect, it } from 'vitest';
import { handler as health } from '../../src/handlers/health.js';
import { handler as whoami, type WhoAmIEvent } from '../../src/handlers/whoami.js';

function eventWith(claims: Record<string, unknown> | undefined): WhoAmIEvent {
  return {
    requestContext: {
      requestId: 'req-1',
      authorizer: claims ? { jwt: { claims } } : {},
    },
  };
}

const claims = {
  sub: 'user-123',
  client_id: 'client-abc',
  token_use: 'access',
  scope: 'openid api/donations.read',
  'cognito:groups': '[DONANTE]',
};

describe('GET /v1/health', () => {
  it('responde 200', async () => {
    const response = await health();
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });
});

describe('GET /v1/whoami', () => {
  it('devuelve la identidad verificada', async () => {
    const response = await whoami(eventWith(claims));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ sub: 'user-123', groups: ['DONANTE'], requestId: 'req-1' });
  });

  it('sin claims responde 401 con formato uniforme (T02)', async () => {
    const response = await whoami(eventWith(undefined));
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Autenticación requerida',
      requestId: 'req-1',
    });
  });

  it('con un ID token responde 401 (T11)', async () => {
    const response = await whoami(eventWith({ ...claims, token_use: 'id' }));
    expect(response.statusCode).toBe(401);
  });

  it('sin el scope requerido responde 403', async () => {
    const response = await whoami(eventWith({ ...claims, scope: 'openid' }));
    expect(response.statusCode).toBe(403);
  });
});
