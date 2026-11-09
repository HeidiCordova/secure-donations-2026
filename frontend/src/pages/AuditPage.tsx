import { useEffect, useState } from 'react';
import { ErrorMessage } from '../components/ErrorMessage';
import { getAuthenticatedJson, getErrorMessage, getErrorStatus } from '../services/projects';

type AuditAction = 'PROJECT_CREATE' | 'PROJECT_PUBLISH' | 'DONATION_CREATE' | 'DONATION_SIMULATE';

interface AuditEvent {
  eventId: string;
  timestamp: string;
  requestId: string;
  actorRef: string;
  action: AuditAction;
  resourceRef: string;
  outcome: string;
}

interface AuditResponse {
  items: AuditEvent[];
  nextToken?: string;
}

interface AuditPageProps {
  onLogin: () => void;
}

const actions: AuditAction[] = [
  'PROJECT_CREATE',
  'PROJECT_PUBLISH',
  'DONATION_CREATE',
  'DONATION_SIMULATE',
];

export function AuditPage({ onLogin }: AuditPageProps) {
  const [action, setAction] = useState<AuditAction>('PROJECT_CREATE');
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ type: action, limit: '50' });
    void getAuthenticatedJson<AuditResponse>(`/v1/audit?${query}`, controller.signal)
      .then(({ items }) => setEvents(items))
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError);
        }
      });
    return () => controller.abort();
  }, [action, retryCount]);

  return (
    <section>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Auditoría</h1>
        <p className="mt-2 text-slate-600">Consulta eventos sin exponer tokens ni datos financieros.</p>
      </header>

      <label className="mb-6 block max-w-md text-sm font-semibold text-slate-800">
        Tipo de evento
        <select
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
          onChange={(event) => {
            setEvents(null);
            setError(null);
            setAction(event.target.value as AuditAction);
          }}
          value={action}
        >
          {actions.map((eventAction) => (
            <option key={eventAction} value={eventAction}>
              {eventAction}
            </option>
          ))}
        </select>
      </label>

      {error !== null && (
        <ErrorMessage
          description={getErrorMessage(error)}
          onLogin={onLogin}
          onRetry={() => {
            setError(null);
            setEvents(null);
            setRetryCount((count) => count + 1);
          }}
          status={getErrorStatus(error)}
        />
      )}
      {!error && events === null && <p role="status">Cargando auditoría…</p>}
      {events?.length === 0 && (
        <ErrorMessage
          description="No hay eventos de este tipo para mostrar."
          title="Sin eventos"
          variant="empty"
        />
      )}
      {events && events.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-3 font-semibold">Fecha</th>
                <th className="px-5 py-3 font-semibold">Acción</th>
                <th className="px-5 py-3 font-semibold">Recurso</th>
                <th className="px-5 py-3 font-semibold">Resultado</th>
                <th className="px-5 py-3 font-semibold">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((event) => (
                <tr key={event.eventId}>
                  <td className="px-5 py-4">{new Date(event.timestamp).toLocaleString('es-PE')}</td>
                  <td className="px-5 py-4">{event.action}</td>
                  <td className="px-5 py-4 break-all">{event.resourceRef}</td>
                  <td className="px-5 py-4">{event.outcome}</td>
                  <td className="px-5 py-4">{event.actorRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
