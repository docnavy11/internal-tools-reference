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

## As built (phase 4)

- `platform/jobs/`: `table.ts`, `define.ts` (`defineJob`, `defineSchedule`,
  `NonRetryableError`, registries, `describeCron`), `enqueue.ts`, `worker.ts`
  (`claimOne`, `runJob`, `reapStale`, `syncSchedules`, `tickScheduler`, `startWorker`),
  `service.ts`, `routes.ts`, `builtin.ts` (`jobs.cleanup` daily, `audit.prune` daily when
  `AUDIT_RETENTION_DAYS` is set), `serialize.ts`.
- Registration: `src/server/features/index.ts` side-effect imports every feature's
  `jobs.ts`, and `src/server/worker.ts` imports that plus `builtin.ts`, so web and worker
  processes share one registry. Job schemas are `ZodType<T, ZodTypeDef, unknown>` so
  `preprocess`/`default` schemas work; payloads are validated at enqueue and again at run.
- Claiming uses `clock_timestamp()` rather than `now()`: `now()` is the transaction
  start, so a job enqueued in the same transaction would never look due (this matters
  in tests and in any code that enqueues and processes within one transaction).
- Dedupe via a partial unique index on `dedupe_key where status in ('pending','running')`
  and `ON CONFLICT ... DO NOTHING`; a duplicate enqueue returns the live job's id.
- The scheduler runs under `pg_advisory_xact_lock` and dedupes on
  `schedule:<name>:<plannedRunAt>`; disabled schedules never fire; removed definitions
  are deleted from the table at sync.
- `defineJob(..., { sensitive: true })` redacts the payload in the admin API for jobs that
  carry secrets (the magic link email job).
- Retry resets `attempts` to 0 and is allowed from failed, dead or cancelled; cancel is
  allowed from pending. Both audited.
- Test hooks: the exported functions run without timers; the three-worker exclusivity
  test uses the real pool outside the per-test transaction and cleans up after itself.
- CSV import (`features/customers/import.ts`): parse with papaparse, validate rows with
  the shared schema, answer 202 with accepted/rejected, enqueue one `customers.import`
  job (max 1 attempt) that inserts in batches of 200 and reports per-row failures.
  Status endpoint is visible to the requester and admins only.

## As built (phase 4, client)

- `/settings/jobs` in `src/client/pages/settings/jobs*.tsx`: Jobs tab is a `DataTable`
  with status and name filters that polls every 5 seconds while a visible row is pending
  or running (`refetchInterval` prop), row click opens a sheet with payload, result, error,
  Retry and Cancel; Schedules tab is a plain table with an enabled switch and Run now.
- Import dialog in `src/client/features/customers/import-dialog.tsx`: template download,
  upload via `apiUpload` (FormData), rejected rows table, status polling, result summary.
- `DataTable` gained optional `refetchInterval(page)` and `onRowClick(row)`.

## Done when

- Tests: claim is exclusive under two concurrent workers, retry with backoff, dead
  after max attempts, dedupe key prevents duplicates, reaper recovers a stale lock,
  scheduler enqueues exactly once across two schedulers, timeout marks failure.
- Golden example enqueues a job inside a transaction and a nightly schedule exists.
