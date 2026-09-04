import type { MiddlewareHandler } from 'hono';
import { env } from '../../env';
import { rolePermissions, type Permission, type Role } from '../../../shared/permissions';
import { AppError, forbidden, unauthorized } from '../http/errors';
import { clientIp } from '../http/rate-limit';
import type { AppEnv } from '../http/types';
import { readSessionCookie, resolveSession } from './sessions';

// Loads the session (if any) for every request. Never rejects by itself.
export const sessionContext: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = readSessionCookie(c);
  const session = token ? await resolveSession(token) : null;
  c.set('session', session);
  c.set(
    'actor',
    session
      ? {
          type: 'user',
          userId: session.user.id,
          requestId: c.get('requestId'),
          ip: clientIp(c.req.raw.headers),
        }
      : { type: 'system', requestId: c.get('requestId') },
  );
  if (session) c.set('log', c.get('log').child({ userId: session.user.id }));
  await next();
};

// Defence in depth next to SameSite=Lax cookies: a browser-issued state-changing
// request must come from our own origin. Requests without Origin and without
// Sec-Fetch-Site are non-browser clients (curl, tests) and pass.
const appOrigin = new URL(env.APP_URL).origin;
export const csrfOriginCheck: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  const origin = c.req.header('origin');
  if (origin !== undefined) {
    if (origin !== appOrigin) throw new AppError('csrf', 403, 'Cross-origin request rejected');
  } else {
    const site = c.req.header('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none')
      throw new AppError('csrf', 403, 'Cross-site request rejected');
  }
  await next();
};

// Markers used by the route coverage test (tests/server/authz-coverage.test.ts): every
// endpoint under /api must carry exactly one of these.
export const AUTHZ = Symbol('authz');
type Tagged = MiddlewareHandler<AppEnv> & { [AUTHZ]?: string };

function tag(handler: MiddlewareHandler<AppEnv>, label: string): MiddlewareHandler<AppEnv> {
  (handler as Tagged)[AUTHZ] = label;
  return handler;
}

export function authzTagOf(handler: unknown): string | undefined {
  return (handler as Tagged | undefined)?.[AUTHZ];
}

export function permissionsForRole(role: Role): readonly Permission[] {
  return rolePermissions[role] ?? [];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

// Any signed-in, active user.
export function requireAuth(): MiddlewareHandler<AppEnv> {
  return tag(async (c, next) => {
    if (!c.get('session')) throw unauthorized();
    await next();
  }, 'auth');
}

export function requirePermission(permission: Permission): MiddlewareHandler<AppEnv> {
  return tag(async (c, next) => {
    const session = c.get('session');
    if (!session) throw unauthorized();
    if (!hasPermission(session.user.role as Role, permission)) throw forbidden();
    await next();
  }, `permission:${permission}`);
}

// Explicitly unauthenticated endpoints: auth flows, health, inbound webhooks.
export function publicRoute(): MiddlewareHandler<AppEnv> {
  return tag(async (_c, next) => next(), 'public');
}
