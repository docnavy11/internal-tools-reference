import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { env } from './env';
import { createApp } from './app';
import { closeDatabase, pingDatabase } from './platform/db/client';
import { runMigrations } from './platform/db/migrate';
import { logger } from './platform/http/logger';
import { startWorker, type Worker } from './worker';

async function main(): Promise<void> {
  const runsWeb = env.APP_MODE === 'web' || env.APP_MODE === 'all';
  const runsWorker = env.APP_MODE === 'worker' || env.APP_MODE === 'all';

  if (env.MIGRATE_ON_START && runsWeb) {
    await runMigrations();
  }

  let server: ServerType | undefined;
  let worker: Worker | undefined;

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

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    await worker?.stop();
    await closeDatabase();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'startup failed');
  process.exit(1);
});
