import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { userManager } from '../auth/authConfig';
import { getErrorMessage } from '../services/projects';

export function CallbackPage() {
  const navigate = useNavigate();
  const callbackStarted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (callbackStarted.current) {
      return;
    }
    callbackStarted.current = true;

    void userManager
      .signinRedirectCallback()
      .then(() => navigate('/', { replace: true }))
      .catch((callbackError: unknown) => setError(getErrorMessage(callbackError)));
  }, [navigate]);

  return (
    <section className="mx-auto max-w-xl px-4 py-16 text-center">
      {error ? (
        <>
          <h1 className="text-2xl font-bold text-slate-900">No se pudo iniciar sesión</h1>
          <p className="mt-3 text-red-800" role="alert">
            {error}
          </p>
          <Link className="mt-6 inline-block font-semibold text-emerald-800 underline" to="/">
            Volver al catálogo
          </Link>
        </>
      ) : (
        <p className="text-slate-600" role="status">
          Verificando la sesión…
        </p>
      )}
    </section>
  );
}
