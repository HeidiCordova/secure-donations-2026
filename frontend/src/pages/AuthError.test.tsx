import { fireEvent, render, screen, within } from '@testing-library/react';
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

    const alert = await screen.findByRole('alert');
    const title = await within(alert).findByText((_, element) => {
      if (!element || element.tagName.toLowerCase() === 'script') {
        return false;
      }

      const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const matchesTitle = /acceso|denegado|autorizado|403/i.test(text);
      const childHasTitle = Array.from(element.children).some((child) =>
        /acceso|denegado|autorizado|403/i.test(child.textContent ?? ''),
      );
      return matchesTitle && !childHasTitle;
    });
    expect(title).toBeInTheDocument();
    expect(screen.getByText('No tienes permisos para realizar esta acción o acceder a este recurso.')).toBeVisible();
    expect(alert.querySelector('svg.lucide-shield-x')).toBeInTheDocument();
    expect(alert).not.toHaveTextContent(/Forbidden|internal stack trace|Error:|403/);

    fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(await screen.findByText('Inicio')).toBeInTheDocument();
  });
});
