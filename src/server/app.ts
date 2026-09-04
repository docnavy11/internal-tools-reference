import { existsSync } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { csrfOriginCheck, sessionContext } from './platform/auth/middleware';
import { authRoutes } from './platform/auth/routes';
import { pingDatabase } from './platform/db/client';
import { logger } from './platform/http/logger';
import { accessLog, apiNotFound, handleError, requestContext } from './platform/http/middleware';
import type { AppEnv } from './platform/http/types';
import { userRoutes } from './platform/users/routes';
import { clientDistDir } from './paths';
import { registerFeatures } from './features';

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use(requestContext);
  app.use(accessLog);
  app.onError(handleError);
  app.notFound(apiNotFound);

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
