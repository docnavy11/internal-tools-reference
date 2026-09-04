import { hostname } from 'node:os';
import { and, eq, inArray, lt, lte, sql } from 'drizzle-orm';
import { env } from '../../env';
import { db as pool, getDb, withTransaction, type DbOrTx } from '../db/client';
import { logger } from '../http/logger';
import { reportError } from '../http/error-reporter';
import {
  getJobDefinition,
  listScheduleDefinitions,
  maxJobTimeoutMs,
  nextRun,
  NonRetryableError,
} from './define';
import { enqueue } from './enqueue';
import { jobs, schedules } from './table';

// The worker: N claim loops, a reaper for stale locks, and a scheduler tick. Each piece
// is an exported function so tests drive them directly without timers.

export type JobRow = typeof jobs.$inferSelect;

export const workerId = `${hostname()}:${process.pid}`;

// Claim one due job. The UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) form
// lets many workers claim concurrently without ever handing out the same row twice.
export async function claimOne(db: DbOrTx = getDb(), claimant = workerId): Promise<JobRow | null> {
  const rows = await db
    .update(jobs)
    .set({
      status: 'running',
      // clock_timestamp(), not now(): now() is frozen at transaction start, which would
      // make a job enqueued moments ago inside the same transaction look "not yet due".
      lockedAt: sql`clock_timestamp()`,
      lockedBy: claimant,
      attempts: sql`${jobs.attempts} + 1`,
      startedAt: sql`coalesce(${jobs.startedAt}, clock_timestamp())`,
    })
    .where(
      eq(
        jobs.id,
        sql`(select ${jobs.id} from ${jobs} where ${jobs.status} = 'pending' and ${jobs.runAt} <= clock_timestamp() order by ${jobs.runAt}, ${jobs.createdAt} for update skip locked limit 1)`,
      ),
    )
    .returning();
  return rows[0] ?? null;
}

// Exponential backoff with jitter: 30s, 60s, 120s ... capped at one hour.
export function backoffMs(attempt: number): number {
  const base = Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 60 * 60_000);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

export interface RunOutcome {
  status: 'succeeded' | 'failed' | 'dead';
  error?: string;
}

// Run a claimed job to completion and record the outcome.
export async function runJob(job: JobRow, db: DbOrTx = getDb()): Promise<RunOutcome> {
  const log = logger.child({
    component: 'jobs',
    jobId: job.id,
    jobName: job.name,
    attempt: job.attempts,
  });
  const def = getJobDefinition(job.name);
  const finish = async (patch: Partial<typeof jobs.$inferInsert>) => {
    await db
      .update(jobs)
      .set({ ...patch, lockedAt: null, lockedBy: null })
      .where(eq(jobs.id, job.id));
  };

  if (!def) {
    const error = `No handler registered for job "${job.name}"`;
    log.error(error);
    await finish({ status: 'dead', lastError: error, finishedAt: new Date() });
    return { status: 'dead', error };
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${def.timeoutMs}ms`)),
    def.timeoutMs,
  );
  try {
    const payload = def.schema.parse(job.payload);
    const result = await Promise.race([
      def.handler(payload, {
        jobId: job.id,
        attempt: job.attempts,
        log,
        actor: { type: 'job', jobId: job.id, jobName: job.name },
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener('abort', () => reject(controller.signal.reason)),
      ),
    ]);
    await finish({
      status: 'succeeded',
      result: (result ?? null) as object | null,
      lastError: null,
      finishedAt: new Date(),
    });
    log.info('job succeeded');
    return { status: 'succeeded' };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const exhausted = job.attempts >= job.maxAttempts;
    if (err instanceof NonRetryableError || exhausted) {
      await finish({ status: 'dead', lastError: error, finishedAt: new Date() });
      reportError(err, { jobId: job.id, jobName: job.name, attempt: job.attempts, exhausted });
      log.error({ err, exhausted }, 'job dead');
      return { status: 'dead', error };
    }
    const runAt = new Date(Date.now() + backoffMs(job.attempts));
    await finish({ status: 'pending', lastError: error, runAt });
    log.warn({ err, runAt }, 'job failed, will retry');
    return { status: 'failed', error };
  } finally {
    clearTimeout(timer);
  }
}

// Return jobs whose worker died mid-run to the queue.
export async function reapStale(db: DbOrTx = getDb(), now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - maxJobTimeoutMs() - 60_000);
  const rows = await db
    .update(jobs)
    .set({
      status: 'pending',
      lockedAt: null,
      lockedBy: null,
      lastError: 'worker lost (lock expired)',
    })
    .where(and(eq(jobs.status, 'running'), lt(jobs.lockedAt, cutoff)))
    .returning({ id: jobs.id });
  if (rows.length) logger.warn({ count: rows.length }, 'reaped stale jobs');
  return rows.length;
}

// Mirror code-defined schedules into the table. Keeps enabled and lastRunAt; recomputes
// nextRunAt when the cron changed; removes rows whose definition is gone.
export async function syncSchedules(db: DbOrTx = getDb()): Promise<void> {
  const defs = listScheduleDefinitions();
  const existing = await db.select().from(schedules);
  const byName = new Map(existing.map((s) => [s.name, s]));
  for (const def of defs) {
    const row = byName.get(def.name);
    if (!row) {
      await db.insert(schedules).values({
        name: def.name,
        cron: def.cron,
        jobName: def.job.name,
        payload: def.payload as object,
        nextRunAt: nextRun(def.cron),
      });
    } else if (row.cron !== def.cron || row.jobName !== def.job.name) {
      await db
        .update(schedules)
        .set({
          cron: def.cron,
          jobName: def.job.name,
          payload: def.payload as object,
          nextRunAt: nextRun(def.cron),
          updatedAt: new Date(),
        })
        .where(eq(schedules.name, def.name));
    }
  }
  const known = new Set(defs.map((d) => d.name));
  const stale = existing.filter((s) => !known.has(s.name)).map((s) => s.name);
  if (stale.length) await db.delete(schedules).where(inArray(schedules.name, stale));
}

const SCHEDULER_LOCK = 7_461_928;

// Enqueue every due schedule exactly once across all workers. The dedupe key carries the
// planned run time, so even a second tick that slipped past the lock cannot double-fire.
export async function tickScheduler(now = new Date()): Promise<number> {
  return withTransaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SCHEDULER_LOCK})`);
    const due = await tx
      .select()
      .from(schedules)
      .where(and(eq(schedules.enabled, true), lte(schedules.nextRunAt, now)));
    let fired = 0;
    for (const s of due) {
      const def = getJobDefinition(s.jobName);
      if (!def) {
        logger.error({ schedule: s.name, jobName: s.jobName }, 'schedule points at an unknown job');
        continue;
      }
      const { deduped } = await enqueue(def, s.payload, {
        tx,
        dedupeKey: `schedule:${s.name}:${s.nextRunAt.toISOString()}`,
      });
      await tx
        .update(schedules)
        .set({ lastRunAt: s.nextRunAt, nextRunAt: nextRun(s.cron, now), updatedAt: now })
        .where(eq(schedules.name, s.name));
      if (!deduped) fired += 1;
    }
    return fired;
  });
}

// ---------------------------------------------------------------------------
// Long-running worker used by main.ts.

export interface Worker {
  stop(): Promise<void>;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}

export function startWorker(): Worker {
  const log = logger.child({ component: 'jobs' });
  const stopping = new AbortController();
  const running = new Set<Promise<void>>();

  const loop = async (n: number) => {
    const claimant = `${workerId}#${n}`;
    while (!stopping.signal.aborted) {
      let job: JobRow | null = null;
      try {
        job = await claimOne(pool, claimant);
        if (job) await runJob(job, pool);
      } catch (err) {
        log.error({ err }, 'worker loop error');
      }
      if (!job) await sleep(env.JOBS_POLL_MS + Math.random() * 250, stopping.signal);
    }
  };

  const periodic = async (name: string, everyMs: number, fn: () => Promise<unknown>) => {
    while (!stopping.signal.aborted) {
      try {
        await fn();
      } catch (err) {
        log.error({ err, task: name }, 'periodic task failed');
      }
      await sleep(everyMs, stopping.signal);
    }
  };

  const start = async () => {
    await syncSchedules(pool);
    for (let n = 0; n < env.JOBS_CONCURRENCY; n++) running.add(loop(n));
    running.add(periodic('reaper', 60_000, () => reapStale(pool)));
    running.add(periodic('scheduler', 30_000, () => tickScheduler()));
    log.info({ concurrency: env.JOBS_CONCURRENCY }, 'worker started');
  };
  const started = start().catch((err) => log.error({ err }, 'worker failed to start'));

  return {
    async stop() {
      await started;
      stopping.abort();
      const grace = new Promise<void>((r) => setTimeout(r, env.JOBS_SHUTDOWN_GRACE_MS).unref());
      await Promise.race([Promise.allSettled([...running]), grace]);
      log.info('worker stopped');
    },
  };
}
