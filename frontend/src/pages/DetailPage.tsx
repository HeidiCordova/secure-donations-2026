import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorMessage } from '../components/ErrorMessage';
import {
  formatPEN,
  getErrorMessage,
  getErrorStatus,
  getJson,
  type Project,
  type ProjectStats,
} from '../services/projects';

interface ProjectDetail {
  project: Project;
  stats: ProjectStats;
}

interface DetailPageProps {
  onLogin: () => void;
}

export function DetailPage({ onLogin }: DetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retryCount, setRetryCount] = useState(0);

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
          setError(requestError);
        }
      });

    return () => controller.abort();
  }, [id, retryCount]);

  if (!id) {
    return (
      <ErrorMessage
        actionLabel="Volver al catálogo"
        actionTo="/"
        description="El enlace no incluye un proyecto. Vuelve al catálogo para elegir uno."
        status={404}
      />
    );
  }

  if (error) {
    return (
      <ErrorMessage
        description={getErrorMessage(error)}
        onLogin={onLogin}
        onRetry={() => {
          setError(null);
          setDetail(null);
          setRetryCount((count) => count + 1);
        }}
        status={getErrorStatus(error)}
      />
    );
  }

  if (!detail) {
    return (
      <section aria-label="Cargando proyecto" aria-live="polite" className="animate-pulse" role="status">
        <div aria-hidden="true">
          <div className="h-4 w-40 rounded bg-slate-200" />
          <div className="mt-3 h-10 w-2/3 rounded bg-slate-200" />
          <div className="mt-6 space-y-3">
            <div className="h-5 rounded bg-slate-200" />
            <div className="h-5 rounded bg-slate-200" />
            <div className="h-5 w-3/4 rounded bg-slate-200" />
          </div>
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex justify-between gap-4">
              <div className="h-4 w-36 rounded bg-slate-200" />
              <div className="h-4 w-28 rounded bg-slate-200" />
            </div>
            <div className="mt-4 h-3 rounded-full bg-slate-200" />
            <div className="mt-2 ml-auto h-4 w-16 rounded bg-slate-200" />
          </div>
        </div>
      </section>
    );
  }

  const { project, stats } = detail;
  const percentage =
    stats.goalAmountCents > 0
      ? Math.min(100, Math.max(0, (stats.confirmedAmountCents / stats.goalAmountCents) * 100))
      : 0;
  const roundedPercentage = Math.round(percentage);

  return (
    <article>
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
