import { ApiRequestError } from '@/client/platform/api/client';

/**
 * Uncaught front-end failures are posted to `POST /api/client-errors`, which logs them
 * with a server request id so a browser problem is findable next to the request that
 * caused it. The endpoint is public and rate limited, so this file is deliberately
 * defensive: it never throws, never retries, and never reports itself.
 */

const REPORT_PATH = '/api/client-errors';
/** The same message reported twice inside this window is sent once. */
const DEDUPE_MS = 10_000;
/** The server's schema caps each field; truncate here so a long stack is not a 400. */
const LIMITS = { message: 2000, stack: 20_000, url: 2000, userAgent: 500 };

const seen = new Map<string, number>();

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function describe(error: unknown): { message: string; stack?: string; requestId?: string } {
  if (error instanceof ApiRequestError) {
    return { message: `${error.code}: ${error.message}`, requestId: error.requestId };
  }
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack };
  }
  return { message: typeof error === 'string' ? error : JSON.stringify(error) };
}

/** True once per message per `DEDUPE_MS`; also drops entries that have aged out. */
function firstInWindow(message: string): boolean {
  const now = Date.now();
  for (const [key, at] of seen) {
    if (now - at > DEDUPE_MS) seen.delete(key);
  }
  const last = seen.get(message);
  if (last !== undefined && now - last <= DEDUPE_MS) return false;
  seen.set(message, now);
  return true;
}

/**
 * Report one error. Safe to call from anywhere, including an error handler: every
 * failure inside it is swallowed, so a broken reporter cannot start a loop.
 */
export function reportClientError(error: unknown): void {
  try {
    const { message, stack, requestId } = describe(error);
    if (!message) return;
    // A failure of the report request itself must not be reported again.
    if (message.includes(REPORT_PATH) || stack?.includes(REPORT_PATH)) return;
    if (!firstInWindow(message)) return;

    const body = JSON.stringify({
      message: truncate(message, LIMITS.message),
      ...(stack ? { stack: truncate(stack, LIMITS.stack) } : {}),
      url: truncate(window.location.href, LIMITS.url),
      ...(requestId ? { requestId } : {}),
      userAgent: truncate(navigator.userAgent, LIMITS.userAgent),
    });

    // Plain fetch rather than `api()`: no 401 hook, no thrown error envelope, and
    // `keepalive` so a report survives the navigation that often follows a crash.
    void fetch(REPORT_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {
      // Reporting is best effort; there is nowhere better to put this failure.
    });
  } catch {
    // Never throw from the reporter.
  }
}

let installed = false;

/**
 * Catches what no React boundary sees: errors thrown outside render and rejected
 * promises nobody awaited. Called once from `main.tsx`.
 */
export function installGlobalErrorReporting(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (event) => {
    reportClientError(event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason);
  });
}
