import { useEffect, useState } from 'react';
import type { User } from 'oidc-client-ts';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { login, logout, userManager } from './auth/authConfig';
import { CatalogPage } from './pages/CatalogPage';
import { CallbackPage } from './pages/CallbackPage';
import { DetailPage } from './pages/DetailPage';
import { DonatePage } from './pages/DonatePage';
import { AuditPage } from './pages/AuditPage';
import { HistoryPage } from './pages/HistoryPage';
import { ManagerPage } from './pages/ManagerPage';
import { getErrorMessage } from './services/projects';

type UserRole = 'DONANTE' | 'GESTOR' | 'AUDITOR';

function getUserRoles(user: User | null): Set<UserRole> {
  const groups = user?.profile['cognito:groups'] ?? user?.profile.groups;
  const values = Array.isArray(groups) ? groups : typeof groups === 'string' ? groups.split(/[,\s]+/) : [];
  const roles = new Set<UserRole>();
  for (const value of values) {
    if (value === 'DONANTE' || value === 'GESTOR' || value === 'AUDITOR') {
      roles.add(value);
    }
  }
  return roles;
}

function getDisplayName(user: User): string {
  const email = user.profile.email;
  const username = user.profile.preferred_username;
  if (typeof email === 'string' && email.length > 0) {
    return email;
  }
  if (typeof username === 'string' && username.length > 0) {
    return username;
  }
  return 'Usuario';
}

function ApplicationRoutes() {
  const { pathname } = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authActionPending, setAuthActionPending] = useState(false);

  useEffect(() => {
    let active = true;
    const onUserLoaded = (loadedUser: User) => setUser(loadedUser);
    const onUserUnloaded = () => setUser(null);

    userManager.events.addUserLoaded(onUserLoaded);
    userManager.events.addUserUnloaded(onUserUnloaded);
    void userManager
      .getUser()
      .then((currentUser) => {
        if (active) {
          setUser(currentUser);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setAuthError(getErrorMessage(error));
        }
      });

    return () => {
      active = false;
      userManager.events.removeUserLoaded(onUserLoaded);
      userManager.events.removeUserUnloaded(onUserUnloaded);
    };
  }, []);

  async function handleLogin() {
    setAuthError(null);
    setAuthActionPending(true);
    try {
      await login();
    } catch (error: unknown) {
      setAuthError(getErrorMessage(error));
      setAuthActionPending(false);
    }
  }

  async function handleLogout() {
    setAuthError(null);
    setAuthActionPending(true);
    try {
      await logout();
    } catch (error: unknown) {
      setAuthError(getErrorMessage(error));
      setAuthActionPending(false);
    }
  }

  const roles = getUserRoles(user);
  const roleLabel = roles.size > 0 ? [...roles].join(', ') : 'SIN ROL';
  const navItems = [
    { label: 'Catálogo', to: '/', active: pathname === '/' || pathname.startsWith('/proyecto/') },
    ...(roles.has('DONANTE')
      ? [
          { label: 'Donar', to: '/donar', active: pathname === '/donar' },
          { label: 'Mi historial', to: '/historial', active: pathname === '/historial' },
        ]
      : []),
    ...(user && (roles.has('GESTOR') || roles.size === 0)
      ? [{ label: 'Gestor', to: '/gestor', active: pathname === '/gestor' }]
      : []),
    ...(roles.has('AUDITOR')
      ? [
          ...(!roles.has('DONANTE')
            ? [{ label: 'Mi historial', to: '/historial', active: pathname === '/historial' }]
            : []),
          { label: 'Auditoría', to: '/auditoria', active: pathname === '/auditoria' },
        ]
      : []),
  ];

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link className="text-lg font-bold tracking-tight text-emerald-800" to="/">
            AQP-SOLIDARIA
          </Link>
          {user && (
            <p className="text-sm text-slate-700" aria-label="Sesión activa">
              {getDisplayName(user)} ({roleLabel})
            </p>
          )}
          <nav aria-label="Navegación principal" className="flex flex-wrap items-center gap-4 text-sm">
            {navItems.map(({ label, to, active }) => (
              <Link
                aria-current={active ? 'page' : undefined}
                className={`border-b-2 py-1 hover:text-emerald-800 ${
                  active
                    ? 'border-emerald-700 font-bold text-emerald-800'
                    : 'border-transparent font-medium text-slate-700'
                }`}
                key={to}
                to={to}
              >
                {label}
              </Link>
            ))}
            {user ? (
              <button
                className="min-h-10 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-60"
                disabled={authActionPending}
                onClick={() => void handleLogout()}
                type="button"
              >
                {authActionPending ? 'Cerrando sesión…' : 'Cerrar sesión'}
              </button>
            ) : (
              <button
                className="min-h-10 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60"
                disabled={authActionPending}
                onClick={() => void handleLogin()}
                type="button"
              >
                {authActionPending ? 'Conectando…' : 'Iniciar sesión'}
              </button>
            )}
          </nav>
        </div>
      </header>
      {authError && (
        <p className="mx-auto mt-4 max-w-6xl px-6 text-sm text-red-800" role="alert">
          Error de autenticación: {authError}
        </p>
      )}
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Routes>
          <Route element={<CatalogPage onLogin={() => void handleLogin()} />} path="/" />
          <Route element={<DetailPage onLogin={() => void handleLogin()} />} path="/proyecto/:id" />
          <Route element={<CallbackPage />} path="/callback" />
          <Route element={<DonatePage onLogin={() => void handleLogin()} />} path="/donar" />
          <Route element={<HistoryPage onLogin={() => void handleLogin()} />} path="/historial" />
          <Route element={<ManagerPage onLogin={() => void handleLogin()} />} path="/gestor" />
          <Route element={<AuditPage onLogin={() => void handleLogin()} />} path="/auditoria" />
        </Routes>
      </main>
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ApplicationRoutes />
    </BrowserRouter>
  );
}

export default App;
