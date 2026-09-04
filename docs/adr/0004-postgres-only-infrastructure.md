# 0004 Postgres is the only infrastructure dependency

Accepted, 2026-09-04

## Context

Job queues usually pull in Redis. Sessions often go to Redis too. Every extra
service is another thing to provision on every platform the tool might run on,
another thing to back up, and another failure mode.

## Decision

Sessions, jobs, cron schedules, settings, audit log, file metadata and the webhook
inbox are all Postgres tables. File bytes go to S3-compatible storage or local disk
behind an adapter. Nothing else is required to run the application.

## Consequences

- `docker compose up` with two services is a complete production-like environment.
- Job throughput is bounded by what a Postgres `SKIP LOCKED` queue can do. This is
  thousands of jobs per minute, far beyond internal tool needs.
- Backup of one database captures the whole system state except file bytes.
- If a tool ever outgrows this, the jobs adapter is the seam to replace.
