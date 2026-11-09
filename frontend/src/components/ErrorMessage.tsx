import { AlertTriangle, FolderOpen, FolderSearch, Lock, RotateCcw, ShieldX, WifiOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

interface ErrorMessageProps {
  status?: number;
  variant?: 'error' | 'empty';
  title?: string;
  description: string;
  onRetry?: () => void;
  onLogin?: () => void;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
}

const buttonClassName =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700';

export function ErrorMessage({
  status,
  variant = 'error',
  title,
  description,
  onRetry,
  onLogin,
  actionLabel,
  actionTo,
  onAction,
}: ErrorMessageProps) {
  const navigate = useNavigate();
  const Icon =
    variant === 'empty'
      ? FolderOpen
      : status === 401
        ? Lock
        : status === 403
          ? ShieldX
          : status === 404
            ? FolderSearch
            : status === 409
              ? AlertTriangle
              : WifiOff;

  const defaultTitle =
    variant === 'empty'
      ? 'No hay contenido para mostrar'
      : status === 401
        ? 'Inicia sesión para continuar'
        : status === 403
          ? 'No tienes acceso'
          : status === 404
            ? 'No encontramos este recurso'
            : status === 409
              ? 'No se pudo completar la operación'
              : 'No pudimos conectarnos';

  const defaultActionLabel =
    actionLabel ??
    (status === 401
      ? 'Iniciar sesión'
      : status === 404
        ? 'Volver al catálogo'
        : status === 409 || (status !== undefined && status >= 500) || status === undefined
          ? 'Reintentar'
          : 'Volver al inicio');

  function handleDefaultAction() {
    if (status === 401 && onLogin) {
      onLogin();
    } else if (onRetry && (status === 409 || (status !== undefined && status >= 500) || status === undefined)) {
      onRetry();
    } else {
      navigate(actionTo ?? '/');
    }
  }

  return (
    <section
      className="flex min-h-[50vh] items-center justify-center py-8"
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-emerald-700">
          <Icon aria-hidden="true" className="h-8 w-8" strokeWidth={1.8} />
        </div>
        <h2 className="mt-5 text-xl font-bold text-slate-900">{title ?? defaultTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-6">
          {onAction ? (
            <button className={buttonClassName} onClick={onAction} type="button">
              {defaultActionLabel}
            </button>
          ) : actionTo ? (
            <Link className={buttonClassName} to={actionTo}>
              {defaultActionLabel}
            </Link>
          ) : (
            <button className={buttonClassName} onClick={handleDefaultAction} type="button">
              {status === 409 || (status !== undefined && status >= 500) || status === undefined ? (
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
              ) : null}
              {defaultActionLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
