import type { ApiError } from '@/shared/api-types';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

// Thin fetch wrapper: JSON in and out, error envelope mapped to a typed error.
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    credentials: 'same-origin',
  });
  if (res.ok) {
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  let body: Partial<ApiError> = {};
  try {
    body = (await res.json()) as ApiError;
  } catch {
    // non-JSON error body
  }
  const err = body.error;
  throw new ApiRequestError(
    res.status,
    err?.code ?? 'http_error',
    err?.message ?? res.statusText,
    err?.requestId,
    err?.details,
  );
}
