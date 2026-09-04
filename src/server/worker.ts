import { logger } from './platform/http/logger';

// Phase 1 stub. Phase 4 replaces this with the job loop, reaper and scheduler.
export interface Worker {
  stop(): Promise<void>;
}

export function startWorker(): Worker {
  const log = logger.child({ component: 'worker' });
  log.info('worker started (stub, no job handlers yet)');
  const heartbeat = setInterval(() => log.debug('worker heartbeat'), 30_000);
  return {
    async stop() {
      clearInterval(heartbeat);
      log.info('worker stopped');
    },
  };
}
