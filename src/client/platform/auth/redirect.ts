/**
 * `redirect_to` values arrive from the URL, so they are only ever used when they are a
 * path on this app: starting with a single `/`. Anything else (an absolute URL, a
 * protocol-relative `//host`) is dropped.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/** The login URL that comes back to `path` after a successful sign-in. */
export function loginPathFor(path: string): string {
  const safe = safeRedirectPath(path);
  return safe && safe !== '/' ? `/login?redirect_to=${encodeURIComponent(safe)}` : '/login';
}
