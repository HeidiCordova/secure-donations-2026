import { useEffect, useState } from 'react';
import type { User } from 'oidc-client-ts';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { login, logout, userManager } from './auth/authConfig';
import { CatalogPage } from './pages/CatalogPage';
import { CallbackPage } from './pages/CallbackPage';
import { DetailPage } from './pages/DetailPage';
import { DonatePage } from './pages/DonatePage';
import { HistoryPage } from './pages/HistoryPage';
import { ManagerPage } from './pages/ManagerPage';
import { getErrorMessage } from './services/projects';

function ApplicationRoutes() {
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authActionPending, setAuthActionPending] = useState(false);

  useEffect(() => {
    let active = true;
    const onUserLoaded = (loadedUser: User) => setUser(loadedUser);
    const onUserUnloaded = () => setUser(null);

    userManager.events.addUserLoaded(onUserLoaded);
    userManager.events.addUserUnloaded(onUserUnloaded);
    void userManager.getUser()
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link className="text-lg font-bold tracking-tight text-emerald-800" to="/">
            AQP-SOLIDARIA
          </Link>
          <nav aria-label="Navegación principal" className="flex flex-wrap items-center gap-4 text-sm">
            <Link className="font-medium text-slate-700 hover:text-emerald-800" to="/">
              Catálogo
            </Link>
            <Link className="font-medium text-slate-700 hover:text-emerald-800" to="/donar">
              Donar
            </Link>
            <Link className="font-medium text-slate-700 hover:text-emerald-800" to="/historial">
              Mi historial
            </Link>
            <Link className="font-medium text-slate-700 hover:text-emerald-800" to="/gestor">
              Gestor
            </Link>
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
        <p className="mx-auto mt-4 max-w-6xl px-4 text-sm text-red-800" role="alert">
          Error de autenticación: {authError}
        </p>
      )}
      <main>
        <Routes>
          <Route element={<CatalogPage />} path="/" />
          <Route element={<DetailPage />} path="/proyecto/:id" />
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
