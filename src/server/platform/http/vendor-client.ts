import type { z } from 'zod';
import { logger } from './logger';

// Outbound HTTP to a vendor: auth headers, timeout, retry on 429/5xx with Retry-After,
// one log line per call, response validated against a Zod schema. Never logs bodies.

export class VendorError extends Error {
  constructor(
    public readonly vendor: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`${vendor} responded ${status}`);
    this.name = 'VendorError';
  }
}

export interface VendorClientOptions {
  name: string;
  baseUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number; // default 15s
  retries?: number; // default 3 attempts total on idempotent methods
  fetchImpl?: typeof fetch; // tests
}

export interface RequestOptions<T> {
  schema: z.ZodType<T>;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  idempotencyKey?: string; // enables retries for POST/PATCH
  headers?: Record<string, string>;
}

const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 60_000);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, Math.min(at - Date.now(), 60_000));
  }
  return Math.round(500 * 2 ** (attempt - 1) * (0.8 + Math.random() * 0.4));
}

export function createVendorClient(opts: VendorClientOptions) {
  const fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxAttempts = opts.retries ?? 3;
  const log = logger.child({ component: 'vendor', vendor: opts.name });

  async function request<T>(method: string, path: string, req: RequestOptions<T>): Promise<T> {
    const url = new URL(path, opts.baseUrl.endsWith('/') ? opts.baseUrl : `${opts.baseUrl}/`);
    for (const [k, v] of Object.entries(req.query ?? {}))
      if (v !== undefined) url.searchParams.set(k, String(v));
    const idempotent =
      method === 'GET' || method === 'HEAD' || method === 'DELETE' || !!req.idempotencyKey;
    const attempts = idempotent ? maxAttempts : 1;

    for (let attempt = 1; ; attempt++) {
      const started = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response | undefined;
      let networkError: unknown;
      try {
        res = await fetchImpl(url, {
          method,
          headers: {
            accept: 'application/json',
            'user-agent': 'internal-tools-reference',
            ...(req.body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...(req.idempotencyKey ? { 'idempotency-key': req.idempotencyKey } : {}),
            ...opts.headers,
            ...req.headers,
          },
          body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        networkError = err;
      } finally {
        clearTimeout(timer);
      }
      const durationMs = Math.round(performance.now() - started);
      log.info(
        { method, path: url.pathname, status: res?.status ?? 'network', durationMs, attempt },
        'vendor call',
      );

      const retryable = networkError ? true : RETRY_STATUSES.has(res!.status);
      if ((networkError || !res!.ok) && retryable && attempt < attempts) {
        await new Promise((r) =>
          setTimeout(r, retryDelayMs(attempt, res?.headers.get('retry-after') ?? null)),
        );
        continue;
      }
      if (networkError)
        throw new VendorError(
          opts.name,
          0,
          String((networkError as Error).message ?? networkError),
        );
      if (!res!.ok)
        throw new VendorError(opts.name, res!.status, (await res!.text()).slice(0, 2000));
      const text = await res!.text();
      const json: unknown = text ? JSON.parse(text) : null;
      return req.schema.parse(json);
    }
  }

  return {
    get: <T>(path: string, req: RequestOptions<T>) => request('GET', path, req),
    post: <T>(path: string, req: RequestOptions<T>) => request('POST', path, req),
    patch: <T>(path: string, req: RequestOptions<T>) => request('PATCH', path, req),
    del: <T>(path: string, req: RequestOptions<T>) => request('DELETE', path, req),
  };
}
