import { useEffect, useState } from 'react';
import type { User } from 'oidc-client-ts';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { login, logout, userManager } from './auth/authConfig';
import { CatalogPage } from './pages/CatalogPage';
import { CallbackPage } from './pages/CallbackPage';
import { DetailPage } from './pages/DetailPage';
import { DonatePage } from './pages/DonatePage';
import { HistoryPage } from './pages/HistoryPage';
import { ManagerPage } from './pages/ManagerPage';
import { getErrorMessage } from './services/projects';

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

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link className="text-lg font-bold tracking-tight text-emerald-800" to="/">
            AQP-SOLIDARIA
          </Link>
          <nav aria-label="Navegación principal" className="flex flex-wrap items-center gap-4 text-sm">
            {[
              { label: 'Catálogo', to: '/', active: pathname === '/' || pathname.startsWith('/proyecto/') },
              { label: 'Donar', to: '/donar', active: pathname === '/donar' },
              { label: 'Mi historial', to: '/historial', active: pathname === '/historial' },
              { label: 'Gestor', to: '/gestor', active: pathname === '/gestor' },
            ].map(({ label, to, active }) => (
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
          <Route element={<DonatePage />} path="/donar" />
          <Route element={<HistoryPage />} path="/historial" />
          <Route element={<ManagerPage />} path="/gestor" />
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
