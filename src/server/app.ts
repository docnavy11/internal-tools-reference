import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { csrfOriginCheck, sessionContext } from './platform/auth/middleware';
import { authRoutes } from './platform/auth/routes';
import { pingDatabase } from './platform/db/client';
import { logger } from './platform/http/logger';
import { accessLog, apiNotFound, handleError, requestContext } from './platform/http/middleware';
import type { AppEnv } from './platform/http/types';
import { userRoutes } from './platform/users/routes';
import { registerFeatures } from './features';

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use(requestContext);
  app.use(accessLog);
  app.onError(handleError);

  app.get('/healthz', (c) => c.json({ ok: true }));
  app.get('/readyz', async (c) => {
    const ok = await pingDatabase();
    return c.json({ ok, database: ok ? 'up' : 'down' }, ok ? 200 : 503);
  });

  const api = new Hono<AppEnv>();
  api.use(sessionContext);
  api.use(csrfOriginCheck);
  api.route('/', authRoutes());
  api.route('/', userRoutes());
  registerFeatures(api);
  api.all('*', apiNotFound);
  app.route('/api', api);

  // Built SPA. In development Vite serves the client and proxies to us instead.
  const clientDir = './dist/client';
  if (existsSync(clientDir)) {
    app.use('/*', serveStatic({ root: clientDir }));
    app.get('*', serveStatic({ path: `${clientDir}/index.html` }));
  } else {
    logger.warn({ clientDir }, 'no client build found; only the API is served');
  }

  return app;
}
