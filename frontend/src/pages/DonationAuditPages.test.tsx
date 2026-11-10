import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { User } from 'oidc-client-ts';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userManager } from '../auth/authConfig';
import { server } from '../mocks/server';
import { AuditPage } from './AuditPage';
import { DonatePage } from './DonatePage';

beforeEach(() => {
  vi.mocked(userManager.getUser).mockResolvedValue(
    new User({
      access_token: 'test-token',
      token_type: 'Bearer',
      profile: {
        sub: 'donor-1',
        iss: 'https://issuer.test',
        aud: 'client',
        exp: 1_798_000_000,
        iat: 1_798_000_000,
      },
    }),
  );
});

describe('DonatePage', () => {
  it('muestra el comprobante y permite copiar el ID y abrir el historial', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    server.use(
      http.post('https://api.test/academic/v1/donations', () =>
        HttpResponse.json({
          donationId: 'donation-123',
          projectId: 'project-1',
          amountCents: 1250,
          currency: 'PEN',
          status: 'PENDIENTE_SIMULACION',
          createdAt: '2026-11-10T12:30:00.000Z',
          updatedAt: '2026-11-10T12:30:00.000Z',
        }),
      ),
    );
    render(
      <MemoryRouter>
        <DonatePage onLogin={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText('Proyecto'), { target: { value: 'project-1' } });
    fireEvent.change(screen.getByLabelText('Monto (S/)'), { target: { value: '12.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear donación simulada' }));

    expect(await screen.findByRole('heading', { name: 'Comprobante de donación' })).toBeInTheDocument();
    expect(screen.getByText('donation-123')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(screen.getByText(/12\.50/)).toBeInTheDocument();
    expect(screen.getByText('Fecha')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver en Mi Historial' })).toHaveAttribute('href', '/historial');

    fireEvent.click(screen.getByRole('button', { name: 'Copiar ID de Donación' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('donation-123'));
    expect(await screen.findByText('ID copiado al portapapeles.')).toBeInTheDocument();
  });
});

describe('AuditPage', () => {
  it('consulta todos los tipos y permite filtrar eventos DONATION_FLAGGED', async () => {
    const requestedTypes: string[] = [];
    server.use(
      http.get('https://api.test/academic/v1/audit', ({ request }) => {
        const type = new URL(request.url).searchParams.get('type') ?? '';
        requestedTypes.push(type);
        return HttpResponse.json({
          items:
            type === 'DONATION_FLAGGED'
              ? [
                  {
                    eventId: 'flagged-1',
                    timestamp: '2026-11-10T12:30:00.000Z',
                    requestId: 'request-1',
                    actorRef: 'actor_123',
                    action: 'DONATION_FLAGGED',
                    resourceRef: 'donation:123',
                    outcome: 'DENIED',
                  },
                ]
              : [],
        });
      }),
    );
    render(<AuditPage onLogin={vi.fn()} />);

    const auditTable = await screen.findByRole('table');
    expect(within(auditTable).getByText('DONATION_FLAGGED')).toBeInTheDocument();
    expect(within(auditTable).getByText('DENIED')).toBeInTheDocument();
    expect(requestedTypes).toContain('PROJECT_CREATE');
    expect(requestedTypes).toContain('DONATION_FLAGGED');

    fireEvent.change(screen.getByRole('combobox', { name: 'Tipo de evento' }), {
      target: { value: 'DONATION_FLAGGED' },
    });
    await waitFor(() => expect(requestedTypes.at(-1)).toBe('DONATION_FLAGGED'));
  });
});
