# 06 Jobs and cron

Background work and schedules on a Postgres table (`../adr/0006`).

## Data model

`jobs`
- `id uuid pk`, `name text not null`, `payload jsonb not null default '{}'`
- `status text not null default 'pending'` check in (`pending`, `running`,
  `succeeded`, `failed`, `dead`, `cancelled`)
- `run_at timestamptz not null default now()`
- `attempts int not null default 0`, `max_attempts int not null default 5`
- `locked_at timestamptz null`, `locked_by text null` (worker id)
- `last_error text null`, `result jsonb null`
- `dedupe_key text null`, unique partial index where status in (`pending`, `running`)
- `created_at`, `started_at`, `finished_at`
- Indexes: `(status, run_at)`, `(name, created_at desc)`

`schedules`
- `name text pk`, `cron text not null`, `job_name text not null`, `payload jsonb`
- `enabled boolean not null default true`
- `last_run_at timestamptz null`, `next_run_at timestamptz not null`
- Rows are upserted from code definitions at worker start; `enabled` is the only
  column edited from the UI.

## API in code

```ts
export const recomputeCustomerStats = defineJob(
  'customers.recompute_stats',
  z.object({ customerId: z.string().uuid().optional() }),
  async (payload, ctx) => { ... },
  { maxAttempts: 3, timeoutMs: 60_000 },
);

await enqueue(recomputeCustomerStats, { customerId }, { runAt, dedupeKey });

defineSchedule('customers.nightly_stats', '0 2 * * *', recomputeCustomerStats, {});
```

- Handlers receive the parsed payload and a `ctx` with a job-scoped logger, the job
  id, and an audit actor.
- `enqueue` may be called inside a transaction by passing `tx`, so the job row
  commits with the change that caused it.

## Worker

- `JOBS_CONCURRENCY` claim loops. Each: claim one due job with `UPDATE ... SET
  status='running', locked_at=now(), locked_by=$worker, attempts=attempts+1 WHERE id
  = (SELECT id FROM jobs WHERE status='pending' AND run_at <= now() ORDER BY run_at
  FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`. If none, sleep `JOBS_POLL_MS`
  (default 1000) with jitter.
- Run the handler under a timeout. On success: `succeeded`, store `result`. On
  error: if `attempts < max_attempts`, back to `pending` with `run_at = now() +
  backoff(attempts)` (exponential, 30s base, capped at 1h, jittered) and
  `last_error`; else `dead`. Error reported through the error reporter.
- Reaper every minute: `running` rows with `locked_at` older than the job's timeout
  plus a grace period go back to `pending` (crash recovery).
- Scheduler tick every 30s under `pg_advisory_xact_lock`: for each enabled schedule
  with `next_run_at <= now()`, enqueue with `dedupeKey = schedule:<name>:<next_run_at>`
  and advance `next_run_at` with `cron-parser`.
- Graceful shutdown: on SIGTERM stop claiming, wait up to `JOBS_SHUTDOWN_GRACE_MS`
  for running jobs, then exit. Unfinished jobs are recovered by the reaper.
- Built-in jobs: `notify.email`, `notify.slack`, `jobs.cleanup` (deletes `succeeded`
  older than `JOBS_RETENTION_DAYS`, scheduled daily), `webhooks.process`.

## Admin page (`/settings/jobs`, permission `jobs:manage`)

Tabs: Jobs and Schedules. Jobs: `DataTable` with status and name filters, payload
and error in an expandable row, actions retry (dead or failed back to pending),
cancel (pending to cancelled). Schedules: list with cron, human-readable
description, last and next run, enable toggle, "run now".

## Done when

- Tests: claim is exclusive under two concurrent workers, retry with backoff, dead
  after max attempts, dedupe key prevents duplicates, reaper recovers a stale lock,
  scheduler enqueues exactly once across two schedulers, timeout marks failure.
- Golden example enqueues a job inside a transaction and a nightly schedule exists.
