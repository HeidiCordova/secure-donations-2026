import { fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../mocks/server';
import { CatalogPage } from './CatalogPage';

describe('API authorization errors', () => {
  it('shows an interactive, friendly error for a 403 without technical details', async () => {
    server.use(
      http.get(/\/v1\/projects$/, () =>
        HttpResponse.json({ error: 'Forbidden', stack: 'internal stack trace' }, { status: 403 }),
      ),
    );

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <Routes>
          <Route element={<CatalogPage onLogin={vi.fn()} />} path="/catalog" />
          <Route element={<p>Inicio</p>} path="/" />
        </Routes>
      </MemoryRouter>,
    );

    const heading = await screen.findByRole('heading', { name: 'No tienes acceso' });
    const alert = screen.getByRole('alert');
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('No tienes permisos para realizar esta acción o acceder a este recurso.')).toBeVisible();
    expect(alert.querySelector('svg.lucide-shield-x')).toBeInTheDocument();
    expect(alert).not.toHaveTextContent(/Forbidden|internal stack trace|Error:|403/);

    fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(await screen.findByText('Inicio')).toBeInTheDocument();
  });
});
