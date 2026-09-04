import { isSafeRedirectPath } from '@/shared/redirect';

/**
 * `redirect_to` values arrive from the URL, so they are only ever used when they are a
 * path on this app. The rule lives in `src/shared/redirect.ts`, shared with the server.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  return value && isSafeRedirectPath(value) ? value : null;
}

/** The login URL that comes back to `path` after a successful sign-in. */
export function loginPathFor(path: string): string {
  const safe = safeRedirectPath(path);
  return safe && safe !== '/' ? `/login?redirect_to=${encodeURIComponent(safe)}` : '/login';
}
