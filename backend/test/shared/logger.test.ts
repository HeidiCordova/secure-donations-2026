import { describe, expect, it } from 'vitest';
import { json, type HttpResponse } from '../../src/shared/http.js';
import { outcomeFromStatus, withLogging, type RequestLog } from '../../src/shared/logger.js';

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.secreto.firma';

function event(routeKey?: string) {
  return {
    requestContext: { requestId: 'req-1', authorizer: { jwt: { claims: { sub: 'ana-sub' } } } },
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ amountCents: 2500, donorSub: 'ana-sub' }),
    ...(routeKey === undefined ? {} : { routeKey }),
  };
}

/** Reloj falso: cada llamada avanza 12 ms. */
function setup(handler: () => Promise<HttpResponse>) {
  const lines: string[] = [];
  let t = 1000;
  const wrapped = withLogging('DONATION_CREATE', handler, {
    write: (line) => lines.push(line),
    clock: () => (t += 12),
  });
  return { lines, wrapped };
}

describe('withLogging (CA-NF07.1)', () => {
  it('escribe una sola línea JSON con requestId, acción, resultado, código y duración', async () => {
    const { lines, wrapped } = setup(() => Promise.resolve(json(201, { donationId: 'd1' })));
    const response = await wrapped(event('POST /v1/donations'));
    expect(response.statusCode).toBe(201);
    expect(lines).toHaveLength(1);
    const log = JSON.parse(lines[0] ?? '') as RequestLog;
    expect(log).toMatchObject({
      level: 'info',
      requestId: 'req-1',
      action: 'DONATION_CREATE',
      routeKey: 'POST /v1/donations',
      outcome: 'SUCCESS',
      statusCode: 201,
      durationMs: 12,
    });
    expect(Date.parse(log.timestamp)).not.toBeNaN();
  });

  it('no registra tokens, sub, cuerpos ni datos de la respuesta (CA-NF01.2)', async () => {
    const { lines, wrapped } = setup(() => Promise.resolve(json(201, { donationId: 'd1', donorSub: 'ana-sub' })));
    await wrapped(event());
    const line = lines[0] ?? '';
    for (const secret of [TOKEN, 'Bearer', 'ana-sub', '2500', 'd1', 'authorization']) {
      expect(line).not.toContain(secret);
    }
  });

  it('en errores registra solo el code del cuerpo uniforme, nunca el mensaje', async () => {
    const { lines, wrapped } = setup(() =>
      Promise.resolve(json(409, { code: 'IDEMPOTENCY_MISMATCH', message: 'texto interno', requestId: 'req-1' })),
    );
    await wrapped(event());
    const log = JSON.parse(lines[0] ?? '') as RequestLog;
    expect(log).toMatchObject({
      level: 'warn',
      outcome: 'CONFLICT',
      statusCode: 409,
      errorCode: 'IDEMPOTENCY_MISMATCH',
    });
    expect(lines[0]).not.toContain('texto interno');
  });

  it('un 401/403 queda como DENIED (evidencia de rechazo, CA-NF07.2)', async () => {
    const { lines, wrapped } = setup(() =>
      Promise.resolve(json(403, { code: 'FORBIDDEN', message: 'x', requestId: 'req-1' })),
    );
    await wrapped(event());
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ outcome: 'DENIED', statusCode: 403, errorCode: 'FORBIDDEN' });
  });

  it('si el handler lanza, responde 500 genérico y lo registra como error', async () => {
    const { lines, wrapped } = setup(() => Promise.reject(new Error('ResourceNotFoundException: tabla x')));
    const response = await wrapped(event());
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('tabla');
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ level: 'error', outcome: 'ERROR', statusCode: 500 });
    expect(lines[0]).not.toContain('tabla');
  });

  it('si escribir el log falla, la respuesta no cambia', async () => {
    const wrapped = withLogging('X', () => Promise.resolve(json(200, {})), {
      write: () => {
        throw new Error('stdout cerrado');
      },
    });
    expect((await wrapped(event())).statusCode).toBe(200);
  });

  it.each([
    [200, 'SUCCESS'],
    [201, 'SUCCESS'],
    [400, 'INVALID'],
    [401, 'DENIED'],
    [403, 'DENIED'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [500, 'ERROR'],
  ])('%i → %s', (status, outcome) => {
    expect(outcomeFromStatus(status)).toBe(outcome);
  });
});
