import { useEffect, useState } from 'react';
import { ErrorMessage } from '../components/ErrorMessage';
import {
  formatPEN,
  getAuthenticatedJson,
  getErrorMessage,
  getErrorStatus,
  getJson,
  type Donation,
  type Project,
} from '../services/projects';

interface DonationsResponse {
  items: Donation[];
}

interface ProjectsResponse {
  items: Project[];
}

interface HistoryPageProps {
  onLogin: () => void;
}

function donationStatusLabel(status: Donation['status']): string {
  switch (status) {
    case 'PENDIENTE_SIMULACION':
      return 'PENDING';
    case 'CONFIRMADA_SIMULADA':
      return 'CONFIRMED';
    case 'RECHAZADA_SIMULADA':
      return 'REJECTED';
  }
}

export function HistoryPage({ onLogin }: HistoryPageProps) {
  const [donations, setDonations] = useState<Donation[] | null>(null);
  const [donationsError, setDonationsError] = useState<unknown>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsError, setProjectsError] = useState<unknown>(null);
  const [selectedDonationId, setSelectedDonationId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Donation | null>(null);
  const [detailError, setDetailError] = useState<unknown>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void getAuthenticatedJson<DonationsResponse>('/v1/donations/me', controller.signal)
      .then(({ items }) => setDonations(items))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDonationsError(error);
        }
      });
    void getJson<ProjectsResponse>('/v1/projects', controller.signal)
      .then(({ items }) => setProjects(items))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setProjectsError(error);
        }
      });
    return () => controller.abort();
  }, [retryCount]);

  async function loadDetail(donationId: string) {
    setSelectedDonationId(donationId);
    setDetail(null);
    setDetailError(null);
    try {
      setDetail(await getAuthenticatedJson<Donation>(`/v1/donations/${encodeURIComponent(donationId)}`));
    } catch (error: unknown) {
      setDetailError(error);
    }
  }

  const projectTitles = new Map(projects.map((project) => [project.projectId, project.title]));

  return (
    <section>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Mi historial de donaciones</h1>
      </header>

      {donationsError !== null && (
        <ErrorMessage
          description={getErrorMessage(donationsError)}
          onLogin={onLogin}
          onRetry={() => {
            setDonationsError(null);
            setDonations(null);
            setRetryCount((count) => count + 1);
          }}
          status={getErrorStatus(donationsError)}
        />
      )}
      {!donationsError && donations === null && (
        <div
          aria-label="Cargando historial de donaciones"
          className="animate-pulse overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          role="status"
        >
          <div className="hidden grid-cols-5 gap-4 bg-slate-50 p-5 sm:grid">
            {[0, 1, 2, 3, 4].map((cell) => (
              <div className="h-4 rounded bg-slate-200" key={cell} />
            ))}
          </div>
          <div className="divide-y divide-slate-100">
            {[0, 1, 2].map((row) => (
              <div className="grid gap-3 p-5 sm:grid-cols-5 sm:gap-4" key={row}>
                {[0, 1, 2, 3, 4].map((cell) => (
                  <div className={`h-4 rounded bg-slate-200 ${cell === 1 ? 'w-3/4' : 'w-full'}`} key={cell} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {projectsError !== null && (
        <ErrorMessage
          description={getErrorMessage(projectsError)}
          onLogin={onLogin}
          onRetry={() => {
            setProjectsError(null);
            setRetryCount((count) => count + 1);
          }}
          status={getErrorStatus(projectsError)}
        />
      )}
      {donations?.length === 0 && (
        <ErrorMessage
          actionLabel="Explorar proyectos"
          actionTo="/"
          description="Cuando realices una donación simulada, aparecerá aquí para que puedas consultarla."
          title="Aún no tienes donaciones"
          variant="empty"
        />
      )}

      {donations && donations.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-3 font-semibold">Fecha</th>
                <th className="px-5 py-3 font-semibold">Proyecto</th>
                <th className="px-5 py-3 font-semibold">Monto</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {donations.map((donation) => (
                <tr key={donation.donationId}>
                  <td className="px-5 py-4">{new Date(donation.createdAt).toLocaleString('es-PE')}</td>
                  <td className="px-5 py-4">{projectTitles.get(donation.projectId) ?? donation.projectId}</td>
                  <td className="px-5 py-4 font-medium">{formatPEN(donation.amountCents)}</td>
                  <td className="px-5 py-4">{donationStatusLabel(donation.status)}</td>
                  <td className="px-5 py-4">
                    <button
                      className="font-semibold text-emerald-800 underline"
                      onClick={() => void loadDetail(donation.donationId)}
                      type="button"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailError !== null && selectedDonationId && (
        <ErrorMessage
          description={getErrorMessage(detailError)}
          onLogin={onLogin}
          onRetry={() => void loadDetail(selectedDonationId)}
          status={getErrorStatus(detailError)}
        />
      )}
      {detail && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-live="polite">
          <h2 className="text-lg font-bold text-slate-900">Detalle de la donación</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Identificador</dt>
              <dd className="break-all font-medium">{detail.donationId}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Proyecto</dt>
              <dd>{projectTitles.get(detail.projectId) ?? detail.projectId}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Monto</dt>
              <dd>{formatPEN(detail.amountCents)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Estado</dt>
              <dd>{donationStatusLabel(detail.status)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Creada</dt>
              <dd>{new Date(detail.createdAt).toLocaleString('es-PE')}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Actualizada</dt>
              <dd>{new Date(detail.updatedAt).toLocaleString('es-PE')}</dd>
            </div>
          </dl>
        </section>
      )}
    </section>
  );
}
