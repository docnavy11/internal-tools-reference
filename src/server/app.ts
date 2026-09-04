import { existsSync } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { csrfOriginCheck, sessionContext } from './platform/auth/middleware';
import { jsonBodyLimit } from './platform/http/body-limit';
import { securityHeaders } from './platform/http/security-headers';
import { clientErrorRoutes } from './platform/http/client-errors';
import { authRoutes } from './platform/auth/routes';
import { auditRoutes } from './platform/audit/routes';
import { jobRoutes } from './platform/jobs/routes';
import './platform/jobs/builtin';
import './platform/notify';
import './platform/storage/jobs';
import { fileRoutes } from './platform/storage/routes';
import { settingsRoutes } from './platform/settings/routes';
import { webhookAdminRoutes } from './platform/webhooks/routes';
import './platform/webhooks/define';
import { registerIntegrations } from './integrations';
import { pingDatabase } from './platform/db/client';
import { logger } from './platform/http/logger';
import { accessLog, apiNotFound, handleError, requestContext } from './platform/http/middleware';
import type { AppEnv } from './platform/http/types';
import { userRoutes } from './platform/users/routes';
import { clientDistDir } from './paths';
import { registerFeatures } from './features';

export interface AppOptions {
  // Tests inject a failing probe to exercise the 503 path.
  pingDatabase?: () => Promise<boolean>;
  // Tests add routes here, before the SPA catch-all would swallow them.
  testRoutes?: (app: Hono<AppEnv>) => void;
}

export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const ping = options.pingDatabase ?? pingDatabase;

  app.use(requestContext);
  app.use(securityHeaders);
  app.use(accessLog);
  app.onError(handleError);
  app.notFound(apiNotFound);
  options.testRoutes?.(app);

  app.get('/healthz', (c) => c.json({ ok: true }));
  app.get('/readyz', async (c) => {
    const ok = await ping();
    return c.json({ ok, database: ok ? 'up' : 'down' }, ok ? 200 : 503);
  });

  const api = new Hono<AppEnv>();
  api.use(sessionContext);
  api.use(csrfOriginCheck);
  // Multipart upload routes override this with uploadBodyLimit on the route itself.
  api.use('*', async (c, next) =>
    c.req.header('content-type')?.startsWith('multipart/form-data')
      ? next()
      : jsonBodyLimit(c, next),
  );
  api.route('/', authRoutes());
  api.route('/', clientErrorRoutes());
  api.route('/', userRoutes());
  api.route('/', auditRoutes());
  api.route('/', jobRoutes());
  api.route('/', fileRoutes());
  api.route('/', settingsRoutes());
  api.route('/', webhookAdminRoutes());
  registerIntegrations(api);
  registerFeatures(api);
  api.all('*', apiNotFound);
  app.route('/api', api);

  // Built SPA. In development Vite serves the client and proxies to us instead.
  // Hashed assets that do not exist must 404, never fall back to index.html.
  if (existsSync(clientDistDir)) {
    const root = path.relative(process.cwd(), clientDistDir) || '.';
    app.use('/*', serveStatic({ root }));
    app.get('/assets/*', (c) => c.notFound());
    app.get('*', serveStatic({ path: path.join(root, 'index.html') }));
  } else {
    logger.warn({ clientDistDir }, 'no client build found; only the API is served');
  }

  return app;
}
