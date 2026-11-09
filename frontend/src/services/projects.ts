import { userManager } from '../auth/authConfig';

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

export type DonationStatus = 'PENDIENTE_SIMULACION' | 'CONFIRMADA_SIMULADA' | 'RECHAZADA_SIMULADA';

export interface Donation {
  donationId: string;
  projectId: string;
  amountCents: number;
  currency: 'PEN';
  status: DonationStatus;
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

class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super('La solicitud a la API no se completó.');
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  headers?: HeadersInit;
  authenticated?: boolean;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error('La API no está disponible.');
  }

  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  if (options.authenticated) {
    const user = await userManager.getUser();
    if (!user || user.expired || !user.access_token) {
      throw new ApiError(401);
    }
    headers.set('authorization', `Bearer ${user.access_token}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  if (!response.ok) {
    throw new ApiError(response.status);
  }

  return (await response.json()) as T;
}

export function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(path, { signal });
}

export function getAuthenticatedJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(path, { authenticated: true, signal });
}

export function postAuthenticatedJson<T>(
  path: string,
  body: unknown,
  headers?: HeadersInit,
): Promise<T> {
  return requestJson<T>(path, { authenticated: true, body, headers, method: 'POST' });
}

export function patchAuthenticatedJson<T>(path: string): Promise<T> {
  return requestJson<T>(path, { authenticated: true, method: 'PATCH' });
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return 'Tu sesión ha expirado o no has iniciado sesión. Por favor, ingresa con tu cuenta.';
      case 403:
        return 'No tienes permisos para realizar esta acción o acceder a este recurso.';
      case 404:
        return 'El recurso o proyecto solicitado no se encuentra disponible.';
      case 409:
        return 'La operación ya fue procesada o se detectó un conflicto. Intenta nuevamente.';
      default:
        return 'Ocurrió un inconveniente temporal. Inténtalo más tarde.';
    }
  }

  return 'Ocurrió un inconveniente temporal. Inténtalo más tarde.';
}

export function getErrorStatus(error: unknown): number | undefined {
  return error instanceof ApiError ? error.status : undefined;
}

export function formatPEN(amountCents: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amountCents / 100);
}
