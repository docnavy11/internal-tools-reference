import { randomUUID } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiError } from '../../../shared/api-types';
import { AppError } from './errors';
import { logger } from './logger';
import { reportError } from './error-reporter';
import type { AppEnv } from './types';

// Reuse an inbound x-request-id (load balancers set one) or mint a UUID. Echo it in
// the response so a user can quote it, and bind it to a child logger.
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export const requestContext: MiddlewareHandler<AppEnv> = async (c, next) => {
  const inbound = c.req.header('x-request-id');
  const requestId = inbound && REQUEST_ID.test(inbound) ? inbound : randomUUID();
  c.set('requestId', requestId);
  c.set('log', logger.child({ requestId }));
  c.header('x-request-id', requestId);
  await next();
};

// One line per request. The matched route pattern is logged rather than the raw
// path so ids do not fragment log aggregates.
export const accessLog: MiddlewareHandler<AppEnv> = async (c, next) => {
  const started = performance.now();
  await next();
  const durationMs = Math.round(performance.now() - started);
  c.get('log').info(
    {
      method: c.req.method,
      path: c.req.routePath,
      status: c.res.status,
      durationMs,
      userId: c.get('session')?.user.id,
    },
    'request',
  );
};

function errorBody(c: Context<AppEnv>, code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, details, requestId: c.get('requestId') } };
}

export function handleError(err: Error, c: Context<AppEnv>): Response {
  if (err instanceof AppError) {
    return c.json(errorBody(c, err.code, err.message, err.details), err.status);
  }
  if (err instanceof HTTPException) {
    const status = err.status as ContentfulStatusCode;
    return c.json(errorBody(c, `http_${status}`, err.message || 'Request failed'), status);
  }
  reportError(err, {
    requestId: c.get('requestId'),
    userId: c.get('session')?.user.id,
    path: c.req.routePath,
    method: c.req.method,
  });
  return c.json(errorBody(c, 'internal', 'Internal server error'), 500);
}

export function apiNotFound(c: Context<AppEnv>): Response {
  return c.json(errorBody(c, 'not_found', `No route for ${c.req.method} ${c.req.path}`), 404);
}
