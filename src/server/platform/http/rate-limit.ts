import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { env } from '../../env';
import { AppError } from './errors';
import type { AppEnv } from './types';

// In-memory fixed-window limiter. Good enough for internal-tool scale and for a
// single process; with several web replicas the effective limit multiplies.
interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  // Returns true when the call is allowed.
  hit(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      this.sweep(now);
      return true;
    }
    bucket.count += 1;
    return bucket.count <= this.limit;
  }

  private sweep(now: number): void {
    if (this.buckets.size < 10_000) return;
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }
}

// The client address, honouring x-forwarded-for only for the configured number of trusted
// proxy hops. With TRUST_PROXY_HOPS=0 the header is ignored entirely: a client can put
// anything in it, and the leftmost value is exactly the part they control.
export function clientIp(c: Context): string {
  const hops = env.TRUST_PROXY_HOPS;
  if (hops > 0) {
    const chain = (c.req.header('x-forwarded-for') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const candidate = chain[chain.length - hops];
    if (candidate) return candidate;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown'; // app.request() in tests has no socket
  }
}

export function rateLimit(opts: {
  limit: number;
  windowMs: number;
  key?: (c: Context) => string;
}): MiddlewareHandler<AppEnv> {
  const limiter = new RateLimiter(opts.limit, opts.windowMs);
  const keyFn = opts.key ?? clientIp;
  return async (c, next) => {
    if (!limiter.hit(keyFn(c))) {
      throw new AppError('rate_limited', 429, 'Too many requests. Try again later.');
    }
    await next();
  };
}
