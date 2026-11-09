import { useState, type FormEvent } from 'react';
import { ErrorMessage } from '../components/ErrorMessage';
import {
  formatPEN,
  getErrorMessage,
  getErrorStatus,
  patchAuthenticatedJson,
  postAuthenticatedJson,
  type Project,
} from '../services/projects';

interface ManagerPageProps {
  onLogin: () => void;
}

function toCents(amount: string): number | undefined {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) {
    return undefined;
  }
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : undefined;
}

export function ManagerPage({ onLogin }: ManagerPageProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [drafts, setDrafts] = useState<Project[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const goalCents = toCents(goal);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (goalCents === undefined) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const project = await postAuthenticatedJson<Project>('/v1/projects', {
        title,
        description,
        goalAmountCents: goalCents,
      });
      setDrafts((current) => [project, ...current]);
      setTitle('');
      setDescription('');
      setGoal('');
    } catch (requestError: unknown) {
      setError(requestError);
    } finally {
      setPending(false);
    }
  }

  async function publishProject(projectId: string) {
    setPublishingId(projectId);
    setError(null);
    try {
      await patchAuthenticatedJson<Project>(`/v1/projects/${encodeURIComponent(projectId)}/publish`);
      setDrafts((current) => current.filter((project) => project.projectId !== projectId));
    } catch (requestError: unknown) {
      setError(requestError);
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <section>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Portal gestor</h1>
        <p className="mt-2 text-slate-600">Crea proyectos solidarios y publícalos cuando estén listos.</p>
      </header>

      {error !== null && (
        <ErrorMessage
          actionLabel={getErrorStatus(error) === 401 ? 'Iniciar sesión' : 'Volver al formulario'}
          description={getErrorMessage(error)}
          onAction={() => {
            if (getErrorStatus(error) === 401) {
              onLogin();
            } else {
              setError(null);
            }
          }}
          status={getErrorStatus(error)}
        />
      )}

      <form
        className="mb-10 max-w-2xl space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={(event) => void createProject(event)}
      >
        <h2 className="text-xl font-semibold text-slate-900">Crear proyecto</h2>
        <label className="block text-sm font-semibold text-slate-800">
          Título
          <input
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
            maxLength={120}
            minLength={3}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          Descripción
          <textarea
            className="mt-2 min-h-32 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
            maxLength={2000}
            minLength={10}
            onChange={(event) => setDescription(event.target.value)}
            required
            value={description}
          />
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          Meta (S/)
          <input
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
            inputMode="decimal"
            min="0.01"
            onChange={(event) => setGoal(event.target.value)}
            placeholder="5000.00"
            required
            step="0.01"
            type="number"
            value={goal}
          />
        </label>
        <button
          className="min-h-11 rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          disabled={pending || goalCents === undefined}
          type="submit"
        >
          {pending ? 'Creando…' : 'Crear borrador'}
        </button>
      </form>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Borradores creados en esta sesión</h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-slate-600">Los nuevos borradores aparecerán aquí para que puedas publicarlos.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {drafts.map((project) => (
              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={project.projectId}>
                <h3 className="text-lg font-semibold text-slate-900">{project.title}</h3>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{project.description}</p>
                <p className="mt-3 text-sm text-slate-700">Meta: {formatPEN(project.goalAmountCents)}</p>
                <button
                  className="mt-4 min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  disabled={publishingId !== null}
                  onClick={() => void publishProject(project.projectId)}
                  type="button"
                >
                  {publishingId === project.projectId ? 'Publicando…' : 'Publicar'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
