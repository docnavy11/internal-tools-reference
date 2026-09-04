import { Hono } from 'hono';
import { z } from 'zod';
import { publicRoute } from '../auth/middleware';
import { rateLimit } from './rate-limit';
import type { AppEnv } from './types';
import { validate } from './validate';

// The SPA posts uncaught errors here so front-end failures show up in server logs with
// the same request ids. Public (the login page can fail too), rate limited, logged only.
const clientError = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(20_000).optional(),
  url: z.string().max(2000).optional(),
  requestId: z.string().max(128).optional(),
  userAgent: z.string().max(500).optional(),
});

export function clientErrorRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.post(
    '/client-errors',
    publicRoute(),
    rateLimit({ limit: 30, windowMs: 60_000 }),
    validate('json', clientError),
    (c) => {
      const body = c.req.valid('json');
      c.get('log').warn(
        { clientError: body, userId: c.get('session')?.user.id },
        'client error reported',
      );
      return c.body(null, 204);
    },
  );
  return r;
}
