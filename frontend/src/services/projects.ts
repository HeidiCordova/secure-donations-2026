export interface Project {
  projectId: string;
  title: string;
  description: string;
  goalAmountCents: number;
  confirmedAmountCents: number;
  currency: 'PEN';
  status: 'BORRADOR' | 'PUBLICADO';
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStats {
  projectId: string;
  goalAmountCents: number;
  confirmedAmountCents: number;
  currency: 'PEN';
}

const apiBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error('Falta configurar la variable de entorno VITE_API_URL.');
  }

  const response = await fetch(`${apiBaseUrl}${path}`, { signal });
  if (!response.ok) {
    throw new Error(`La API respondió con el estado HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado al comunicarse con el servicio.';
}

export function formatPEN(amountCents: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amountCents / 100);
}
