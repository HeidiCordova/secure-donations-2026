import { render, screen } from '@testing-library/react';
import { User } from 'oidc-client-ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userManager } from './auth/authConfig';
import { App } from './App';

function createUser(groups: string[]) {
  return new User({
    access_token: 'test-access-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    profile: {
      sub: 'test-user',
      iss: 'https://issuer.example',
      aud: 'test-client',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      'cognito:groups': groups,
    },
    token_type: 'Bearer',
  });
}

describe('role-based navigation', () => {
  beforeEach(() => {
    vi.mocked(userManager.getUser).mockReset();
  });

  it('shows only the catalog and login when unauthenticated', async () => {
    vi.mocked(userManager.getUser).mockResolvedValue(null);
    render(<App />);

    expect(await screen.findByRole('link', { name: 'Catálogo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Gestor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Donar' })).not.toBeInTheDocument();
  });

  it('shows each module assigned by multiple Cognito groups', async () => {
    vi.mocked(userManager.getUser).mockResolvedValue(createUser(['DONANTE', 'GESTOR', 'AUDITOR']));
    render(<App />);

    expect(await screen.findByRole('link', { name: 'Gestor' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Donar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mi historial' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Auditoría' })).toBeInTheDocument();
  });

  it('keeps the manager portal visible for local users without groups', async () => {
    vi.mocked(userManager.getUser).mockResolvedValue(createUser([]));
    render(<App />);

    expect(await screen.findByRole('link', { name: 'Gestor' })).toBeInTheDocument();
  });
});
