import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ErrorMessage } from '../components/ErrorMessage';
import {
  formatPEN,
  getErrorMessage,
  getErrorStatus,
  getJson,
  postAuthenticatedJson,
  type Donation,
  type Project,
} from '../services/projects';

interface ProjectsResponse {
  items: Project[];
}

interface DonationPageProps {
  onLogin: () => void;
}

interface DonationAttempt {
  idempotencyKey: string;
  projectId: string;
  amountCents: number;
}

function donationStatusLabel(status: Donation['status']): string {
  switch (status) {
    case 'PENDIENTE_SIMULACION':
      return 'Pendiente de simulación';
    case 'CONFIRMADA_SIMULADA':
      return 'Confirmada (simulada)';
    case 'RECHAZADA_SIMULADA':
      return 'Rechazada (simulada)';
  }
}

function donationStatusBadgeClass(status: Donation['status']): string {
  switch (status) {
    case 'PENDIENTE_SIMULACION':
      return 'bg-amber-100 text-amber-900';
    case 'CONFIRMADA_SIMULADA':
      return 'bg-emerald-100 text-emerald-800';
    case 'RECHAZADA_SIMULADA':
      return 'bg-red-100 text-red-800';
  }
}

function toCents(amount: string): number | undefined {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) {
    return undefined;
  }
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 100 && cents <= 100_000 ? cents : undefined;
}

export function DonatePage({ onLogin }: DonationPageProps) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsError, setProjectsError] = useState<unknown>(null);
  const [projectRetry, setProjectRetry] = useState(0);
  const [projectId, setProjectId] = useState('');
  const [amount, setAmount] = useState('');
  const [donation, setDonation] = useState<Donation | null>(null);
  const [requestError, setRequestError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const activeAttempt = useRef<DonationAttempt | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getJson<ProjectsResponse>('/v1/projects', controller.signal)
      .then(({ items }) => setProjects(items))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setProjectsError(error);
        }
      });
    return () => controller.abort();
  }, [projectRetry]);

  async function sendDonation(attempt: DonationAttempt) {
    setPending(true);
    setRequestError(null);
    setDonation(null);
    setCopyStatus('idle');
    try {
      const created = await postAuthenticatedJson<Donation>(
        '/v1/donations',
        { projectId: attempt.projectId, amountCents: attempt.amountCents },
        { 'Idempotency-Key': attempt.idempotencyKey },
      );
      setDonation(created);
      activeAttempt.current = null;
    } catch (error: unknown) {
      setRequestError(error);
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = toCents(amount);
    if (!projectId || amountCents === undefined) {
      return;
    }
    const attempt = { idempotencyKey: crypto.randomUUID(), projectId, amountCents };
    activeAttempt.current = attempt;
    void sendDonation(attempt);
  }

  async function simulateConfirmation() {
    if (!donation) {
      return;
    }
    setConfirming(true);
    setRequestError(null);
    try {
      const updated = await postAuthenticatedJson<Donation>(
        `/v1/donations/${encodeURIComponent(donation.donationId)}/simulate`,
        { outcome: 'CONFIRMADA_SIMULADA' },
      );
      setDonation(updated);
    } catch (error: unknown) {
      setRequestError(error);
    } finally {
      setConfirming(false);
    }
  }

  async function copyDonationId() {
    if (!donation) {
      return;
    }
    try {
      await navigator.clipboard.writeText(donation.donationId);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }

  const amountCents = toCents(amount);

  return (
    <section className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Realizar una donación</h1>
        <p className="mt-2 text-sm text-slate-600">Elige un proyecto y aporta entre S/ 1 y S/ 1,000.</p>
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Simulación académica: no se ha realizado ningún cobro.
        </p>
      </header>

      {projectsError !== null && (
        <ErrorMessage
          description={getErrorMessage(projectsError)}
          onLogin={onLogin}
          onRetry={() => {
            setProjectsError(null);
            setProjects(null);
            setProjectRetry((count) => count + 1);
          }}
          status={getErrorStatus(projectsError)}
        />
      )}
      {!projectsError && projects === null && (
        <div
          aria-label="Cargando formulario de donación"
          className="animate-pulse space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          role="status"
        >
          <div className="h-5 w-1/3 rounded bg-slate-200" />
          <div className="space-y-2">
            <div className="h-4 w-24 rounded bg-slate-200" />
            <div className="h-11 rounded-lg bg-slate-200" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-20 rounded bg-slate-200" />
            <div className="h-11 rounded-lg bg-slate-200" />
          </div>
          <div className="h-11 rounded-lg bg-slate-300" />
        </div>
      )}
      {!projectsError && projects?.length === 0 && (
        <ErrorMessage
          actionLabel="Actualizar catálogo"
          description="No hay proyectos publicados disponibles para recibir donaciones."
          onAction={() => setProjectRetry((count) => count + 1)}
          title="No hay proyectos disponibles"
          variant="empty"
        />
      )}

      {projects && projects.length > 0 && (
        <form className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-slate-800">
            Proyecto
            <select
              className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
              onChange={(event) => setProjectId(event.target.value)}
              required
              value={projectId}
            >
              <option value="">Selecciona un proyecto</option>
              {projects.map((project) => (
                <option key={project.projectId} value={project.projectId}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-slate-800">
            Monto (S/)
            <input
              className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
              inputMode="decimal"
              max="1000"
              min="1"
              onChange={(event) => setAmount(event.target.value)}
              placeholder="25.00"
              required
              step="0.01"
              type="number"
              value={amount}
            />
          </label>

          {requestError !== null && (
            <ErrorMessage
              description={getErrorMessage(requestError)}
              onLogin={onLogin}
              onRetry={() => {
                if (activeAttempt.current) {
                  void sendDonation(activeAttempt.current);
                } else if (donation) {
                  void simulateConfirmation();
                }
              }}
              status={getErrorStatus(requestError)}
            />
          )}

          {donation ? (
            <section
              aria-live="polite"
              className="space-y-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"
              role="status"
            >
              <header>
                <h2 className="text-xl font-bold">Comprobante de donación</h2>
                <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-emerald-800">
                  Intención de donación registrada
                </p>
              </header>
              <div className="rounded-lg border border-emerald-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ID de Donación</p>
                <p className="mt-1 break-all font-mono text-lg font-bold text-slate-900">{donation.donationId}</p>
              </div>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-emerald-800">Monto</dt>
                  <dd className="mt-1 text-lg font-bold">{formatPEN(donation.amountCents)}</dd>
                </div>
                <div>
                  <dt className="text-emerald-800">Fecha</dt>
                  <dd className="mt-1 font-medium">{new Date(donation.createdAt).toLocaleString('es-PE')}</dd>
                </div>
                <div>
                  <dt className="text-emerald-800">Estado</dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 font-semibold ${donationStatusBadgeClass(donation.status)}`}
                    >
                      {donationStatusLabel(donation.status)}
                    </span>
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800"
                  onClick={() => void copyDonationId()}
                  type="button"
                >
                  Copiar ID de Donación
                </button>
                <Link className="font-semibold text-emerald-800 underline" to="/historial">
                  Ver en Mi Historial
                </Link>
              </div>
              {copyStatus === 'copied' && <p className="text-sm font-medium">ID copiado al portapapeles.</p>}
              {copyStatus === 'error' && (
                <p className="text-sm font-medium text-red-800" role="alert">
                  No se pudo copiar el ID. Puedes seleccionarlo y copiarlo manualmente.
                </p>
              )}
              {donation.status === 'PENDIENTE_SIMULACION' && (
                <button
                  className="min-h-11 rounded-lg border border-emerald-700 px-4 py-2 font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
                  disabled={confirming}
                  onClick={() => void simulateConfirmation()}
                  type="button"
                >
                  {confirming ? 'Confirmando…' : 'Simular Confirmación de Pago'}
                </button>
              )}
              <button
                className="block font-semibold text-emerald-800 underline"
                onClick={() => {
                  setDonation(null);
                  setRequestError(null);
                  setAmount('');
                  setCopyStatus('idle');
                }}
                type="button"
              >
                Iniciar una nueva donación
              </button>
            </section>
          ) : (
            <button
              className="min-h-11 w-full rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              disabled={pending || !projectId || amountCents === undefined}
              type="submit"
            >
              {pending ? 'Procesando…' : 'Crear donación simulada'}
            </button>
          )}
        </form>
      )}
    </section>
  );
}
