import type { MiddlewareHandler } from 'hono';
import { env } from '../../env';
import type { AppEnv } from './types';

// Applied to every response. The CSP fits the built SPA: scripts and styles are files
// served from this origin, inline style attributes are used by UI primitives, avatars come
// from the identity provider over https, and nothing is ever framed.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header('content-security-policy', csp);
  c.header('x-content-type-options', 'nosniff');
  c.header('referrer-policy', 'strict-origin-when-cross-origin');
  c.header('x-frame-options', 'DENY');
  c.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  // APP_URL is the public scheme. Behind a TLS-terminating proxy the request itself
  // arrives as http, so the request URL would never trigger HSTS.
  if (env.APP_URL.startsWith('https://'))
    c.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
};
