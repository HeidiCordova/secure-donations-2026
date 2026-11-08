import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  formatPEN,
  getErrorMessage,
  getJson,
  type Project,
} from '../services/projects';

interface ProjectsResponse {
  items: Project[];
}

export function CatalogPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getJson<ProjectsResponse>('/v1/projects', controller.signal)
      .then(({ items }) => setProjects(items))
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(requestError));
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-700">
          AQP-SOLIDARIA
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Catálogo de proyectos
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Conoce las iniciativas publicadas y el avance de sus metas solidarias.
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
          No se pudo cargar el catálogo: {error}
        </p>
      )}
      {!error && projects === null && (
        <p className="text-slate-600" role="status">Cargando proyectos…</p>
      )}
      {!error && projects?.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
          No hay proyectos publicados por el momento.
        </p>
      )}

      {projects && projects.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              key={project.projectId}
            >
              <h2 className="text-xl font-semibold text-slate-900">{project.title}</h2>
              <p className="mt-3 flex-1 whitespace-pre-line text-sm leading-6 text-slate-600">
                {project.description}
              </p>
              <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-slate-500">Recaudado</dt>
                  <dd className="mt-1 font-semibold text-emerald-800">
                    {formatPEN(project.confirmedAmountCents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Meta</dt>
                  <dd className="mt-1 font-semibold text-slate-900">
                    {formatPEN(project.goalAmountCents)}
                  </dd>
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
