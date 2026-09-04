import type { MiddlewareHandler } from 'hono';
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

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}

export function rateLimit(opts: {
  limit: number;
  windowMs: number;
  key?: (headers: Headers) => string;
}): MiddlewareHandler<AppEnv> {
  const limiter = new RateLimiter(opts.limit, opts.windowMs);
  const keyFn = opts.key ?? clientIp;
  return async (c, next) => {
    if (!limiter.hit(keyFn(c.req.raw.headers))) {
      throw new AppError('rate_limited', 429, 'Too many requests. Try again later.');
    }
    await next();
  };
}
