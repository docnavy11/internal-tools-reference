import type { Server as HttpServer } from 'node:http';
import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { env } from './env';
import { createApp } from './app';
import { closeDatabase, pingDatabase } from './platform/db/client';
import { runMigrations } from './platform/db/migrate';
import { logger } from './platform/http/logger';
import { initErrorReporter } from './platform/http/error-reporter';
import { startWorker, type Worker } from './worker';

const SHUTDOWN_TIMEOUT_MS = 30_000;

let server: ServerType | undefined;
let worker: Worker | undefined;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const forceExit = setTimeout(() => {
    logger.error('shutdown timed out; exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  const closeServer = new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
    // Keep-alive connections would otherwise hold close() open until they time out.
    (server as HttpServer).closeIdleConnections?.();
  });
  await Promise.all([closeServer, worker?.stop()]);
  await closeDatabase();
  process.exit(0);
}

// Registered before anything slow (migrations) so a SIGTERM during boot is handled.
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

async function main(): Promise<void> {
  await initErrorReporter();
  const runsWeb = env.APP_MODE === 'web' || env.APP_MODE === 'all';
  const runsWorker = env.APP_MODE === 'worker' || env.APP_MODE === 'all';

  // Any mode may migrate; the migrator holds an advisory lock so concurrent web and
  // worker replicas serialise instead of racing.
  if (env.MIGRATE_ON_START) {
    await runMigrations();
  }
  if (shuttingDown) return;

  if (runsWeb) {
    const app = createApp();
    server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
      logger.info({ port: info.port, mode: env.APP_MODE }, 'web listening');
    });
  } else {
    // Worker-only processes still expose health endpoints for platform probes.
    const health = new Hono();
    health.get('/healthz', (c) => c.json({ ok: true }));
    health.get('/readyz', async (c) => {
      const ok = await pingDatabase();
      return c.json({ ok }, ok ? 200 : 503);
    });
    server = serve({ fetch: health.fetch, port: env.HEALTH_PORT }, (info) => {
      logger.info({ port: info.port }, 'worker health listening');
    });
  }

  if (runsWorker) {
    worker = startWorker();
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'startup failed');
  process.exit(1);
});
