import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatPEN, getErrorMessage, getJson, type Project, type ProjectStats } from '../services/projects';

interface ProjectDetail {
  project: Project;
  stats: ProjectStats;
}

export function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }

    const controller = new AbortController();
    void Promise.all([
      getJson<Project>(`/v1/projects/${encodeURIComponent(id)}`, controller.signal),
      getJson<ProjectStats>(`/v1/projects/${encodeURIComponent(id)}/stats`, controller.signal),
    ])
      .then(([project, stats]) => setDetail({ project, stats }))
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(requestError));
        }
      });

    return () => controller.abort();
  }, [id]);

  if (!id) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
          No se indicó el identificador del proyecto.
        </p>
        <Link className="mt-6 inline-block font-semibold text-emerald-800 underline" to="/">
          Volver al catálogo
        </Link>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
          No se pudo cargar el proyecto: {error}
        </p>
        <Link className="mt-6 inline-block font-semibold text-emerald-800 underline" to="/">
          Volver al catálogo
        </Link>
      </section>
    );
  }

  if (!detail) {
    return (
      <p className="mx-auto max-w-4xl px-4 py-10 text-slate-600" role="status">
        Cargando proyecto…
      </p>
    );
  }

  const { project, stats } = detail;
  const percentage =
    stats.goalAmountCents > 0
      ? Math.min(100, Math.max(0, (stats.confirmedAmountCents / stats.goalAmountCents) * 100))
      : 0;
  const roundedPercentage = Math.round(percentage);

  return (
    <article className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <Link className="font-semibold text-emerald-800 underline" to="/">
        ← Volver al catálogo
      </Link>
      <header className="mt-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Proyecto solidario</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{project.title}</h1>
        <p className="mt-5 whitespace-pre-line text-lg leading-8 text-slate-700">{project.description}</p>
      </header>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span className="font-semibold text-slate-900">Recaudado: {formatPEN(stats.confirmedAmountCents)}</span>
          <span className="text-slate-600">Meta: {formatPEN(stats.goalAmountCents)}</span>
        </div>
        <div
          aria-label="Avance de recaudación"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={roundedPercentage}
          className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
        >
          <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${percentage}%` }} />
        </div>
        <p className="mt-2 text-right text-sm font-medium text-slate-600">{roundedPercentage}% de la meta</p>
      </section>
    </article>
  );
}
