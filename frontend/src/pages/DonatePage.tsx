import { useEffect, useRef, useState, type FormEvent } from 'react';
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

  const amountCents = toCents(amount);

  return (
    <section className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Realizar una donación</h1>
        <p className="mt-2 text-sm text-slate-600">Elige un proyecto y aporta entre S/ 1 y S/ 1,000.</p>
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Simulación académica: no se realizará ningún cobro.
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
      {!projectsError && projects === null && <p role="status">Cargando proyectos…</p>}
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
            <div className="space-y-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-950" role="status">
              <p>
                Donación {donation.donationId}: {formatPEN(donation.amountCents)} — {donation.status}
              </p>
              {donation.status === 'PENDIENTE_SIMULACION' && (
                <button
                  className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
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
                }}
                type="button"
              >
                Iniciar una nueva donación
              </button>
            </div>
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
