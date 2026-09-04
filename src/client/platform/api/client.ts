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

  /** Zod `flatten()` output the server puts in `details` for 400 validation errors. */
  get fieldErrors(): Record<string, string[] | undefined> {
    const details = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return details?.fieldErrors ?? {};
  }
}

export interface ApiRequestInit extends RequestInit {
  /**
   * Skip the global 401 handler. Only `/api/me` needs this: a 401 there is the normal
   * answer for an anonymous visitor, not an expired session.
   */
  skipUnauthorized?: boolean;
}

// The session provider registers a handler here so that a 401 on any authenticated
// call drops client session state and sends the user back to /login.
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

// Thin fetch wrapper: JSON in and out, error envelope mapped to a typed error.
export async function api<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { skipUnauthorized, ...requestInit } = init;
  const res = await fetch(path, {
    ...requestInit,
    headers: {
      accept: 'application/json',
      ...(requestInit.body ? { 'content-type': 'application/json' } : {}),
      ...requestInit.headers,
    },
    credentials: 'same-origin',
  });
  if (res.ok) {
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  throw await readError(res, skipUnauthorized);
}

/** Error envelope to typed error, plus the global 401 hook. Shared by every helper. */
async function readError(res: Response, skipUnauthorized = false): Promise<ApiRequestError> {
  let body: Partial<ApiError> = {};
  try {
    body = (await res.json()) as ApiError;
  } catch {
    // non-JSON error body
  }
  if (res.status === 401 && !skipUnauthorized) onUnauthorized?.();
  const err = body.error;
  return new ApiRequestError(
    res.status,
    err?.code ?? 'http_error',
    err?.message ?? res.statusText,
    err?.requestId,
    err?.details,
  );
}

/**
 * Multipart upload. `api()` sets a JSON content-type whenever there is a body, which
 * would break the multipart boundary, so the request is built here instead; the error
 * envelope mapping and the 401 hook are shared through `readError`.
 */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    body: formData,
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (res.ok) {
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  throw await readError(res, false);
}

/** POST/PATCH helper: serialises the body and returns the parsed response. */
export function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  return api<T>(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
