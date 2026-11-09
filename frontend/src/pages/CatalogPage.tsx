import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorMessage } from '../components/ErrorMessage';
import { formatPEN, getErrorMessage, getErrorStatus, getJson, type Project } from '../services/projects';

interface ProjectsResponse {
  items: Project[];
}

function CatalogSkeleton() {
  return (
    <div aria-label="Cargando proyectos" aria-live="polite" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="status">
      {[0, 1, 2].map((card) => (
        <article
          aria-hidden="true"
          className="animate-pulse flex flex-col rounded-xl border border-slate-200 bg-slate-200 p-6 shadow-sm"
          key={card}
        >
          <div className="h-6 w-3/4 rounded bg-slate-300" />
          <div className="mt-4 flex-1 space-y-2">
            <div className="h-4 rounded bg-slate-300" />
            <div className="h-4 rounded bg-slate-300" />
            <div className="h-4 w-2/3 rounded bg-slate-300" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[0, 1].map((amount) => (
              <div className="space-y-2 rounded-lg bg-slate-100 p-3" key={amount}>
                <div className="h-3 w-2/3 rounded bg-slate-200" />
                <div className="h-5 w-3/4 rounded bg-slate-200" />
              </div>
            ))}
          </div>
          <div className="mt-6 h-11 rounded-lg bg-slate-300" />
        </article>
      ))}
    </div>
  );
}

interface CatalogPageProps {
  onLogin: () => void;
}

export function CatalogPage({ onLogin }: CatalogPageProps) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void getJson<ProjectsResponse>('/v1/projects', controller.signal)
      .then(({ items }) => setProjects(items))
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError);
        }
      });

    return () => controller.abort();
  }, [retryCount]);

  return (
    <section>
      <header className="mb-8">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-700">AQP-SOLIDARIA</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Catálogo de proyectos</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Conoce las iniciativas publicadas y el avance de sus metas solidarias.
        </p>
      </header>

      {error !== null && (
        <ErrorMessage
          description={getErrorMessage(error)}
          onLogin={onLogin}
          onRetry={() => {
            setError(null);
            setProjects(null);
            setRetryCount((count) => count + 1);
          }}
          status={getErrorStatus(error)}
        />
      )}
      {!error && projects === null && <CatalogSkeleton />}
      {!error && projects?.length === 0 && (
        <ErrorMessage
          actionLabel="Actualizar catálogo"
          description="Estamos preparando nuevas iniciativas solidarias. Vuelve pronto para descubrirlas."
          onAction={() => setRetryCount((count) => count + 1)}
          title="No hay proyectos disponibles"
          variant="empty"
        />
      )}

      {projects && projects.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              key={project.projectId}
            >
              <h2 className="text-xl font-semibold text-slate-900">{project.title}</h2>
              <p className="mt-3 flex-1 whitespace-pre-line text-sm leading-6 text-slate-600">{project.description}</p>
              <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-slate-500">Recaudado</dt>
                  <dd className="mt-1 font-semibold text-emerald-800">{formatPEN(project.confirmedAmountCents)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Meta</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{formatPEN(project.goalAmountCents)}</dd>
                </div>
              </dl>
              <Link
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                to={`/proyecto/${project.projectId}`}
              >
                Ver proyecto
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
