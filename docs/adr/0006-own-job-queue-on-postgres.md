# 0006 Jobs and cron are implemented in the repo on a Postgres table

Accepted, 2026-09-04

## Context

pg-boss and graphile-worker are solid Postgres queues. Both have had API changes
across recent majors and the builder's knowledge of their current surfaces is
partial (`0002`). The queue pattern itself, a table with `FOR UPDATE SKIP LOCKED`,
is standard and well understood. The jobs admin page wants to read and mutate the
jobs table directly, which is awkward through a library's abstraction.

## Decision

Write it (`platform/jobs/`):

- `jobs` table: name, JSON payload, status (`pending`, `running`, `succeeded`,
  `failed`, `dead`), `run_at`, `attempts`, `max_attempts`, `locked_at`,
  `locked_by`, `last_error`, `dedupe_key`, timestamps.
- `defineJob(name, payloadSchema, handler, options)` registers a handler with a
  Zod schema for its payload. `enqueue(name, payload, { runAt?, dedupeKey? })`
  inserts a row.
- Worker loop: claim one job with a single `UPDATE ... WHERE id = (SELECT ... FOR
  UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, run the handler with a timeout, mark
  the result. Exponential backoff between attempts. Jobs that exceed
  `max_attempts` become `dead`. A reaper returns jobs whose lock is older than the
  timeout to `pending`.
- Concurrency: N claim loops in one process, configured by `JOBS_CONCURRENCY`.
- Schedules: `defineSchedule(name, cronExpression, jobName, payload?)` in code,
  mirrored into a `schedules` table holding `last_run_at` and `next_run_at`. A
  scheduler tick under a Postgres advisory lock enqueues due jobs, so several
  workers do not double-fire. `cron-parser` computes the next run.
- Admin page: list and filter jobs, inspect payload and error, retry, cancel,
  see schedules and trigger one now.

## Consequences

- Around four hundred lines including tests. Full visibility in the admin page.
- No archiving of finished jobs by default; a scheduled cleanup job deletes
  `succeeded` rows older than `JOBS_RETENTION_DAYS`.
- If throughput or features ever demand it, pg-boss slots in behind the same
  `enqueue` and `defineJob` functions.
