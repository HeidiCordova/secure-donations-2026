import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CatalogPage } from './CatalogPage';

describe('CatalogPage', () => {
  it('renders project cards from the projects API', async () => {
    render(
      <MemoryRouter>
        <CatalogPage onLogin={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status', { name: 'Cargando proyectos' })).toBeInTheDocument();
    await waitForElementToBeRemoved(() => screen.queryByRole('status', { name: 'Cargando proyectos' }));
    const projectTitle = await screen.findByText((_, element) => {
      if (element?.tagName.toLowerCase() !== 'h2') {
        return false;
      }

      const title = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return /biblioteca|comunitaria|proyecto/i.test(title);
    });
    expect(projectTitle).toBeInTheDocument();
    expect(screen.getByText('Libros y espacios de lectura para el barrio.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver proyecto' })).toHaveAttribute('href', '/proyecto/project-1');
  });
});
