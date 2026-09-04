# 05 Audit log

Every mutation records who did what to which record, with before and after state,
in the same transaction as the change (`../adr/0011`).

## Data model

`audit_log`
- `id uuid pk`
- `at timestamptz not null default now()`
- `actor_type text not null` check in (`user`, `system`, `job`)
- `actor_id uuid null fk users`
- `action text not null` such as `customers.create`, `customers.update`,
  `customers.delete`, `customers.bulk_status`, `users.disable`, `settings.update`
- `entity_type text not null`, `entity_id uuid null`
- `before jsonb null`, `after jsonb null`
- `metadata jsonb null`: `requestId`, `ip`, `jobId`, free-form extras
- Indexes: `(entity_type, entity_id, at desc)`, `(actor_id, at desc)`, `(at desc)`

Rows are never updated or deleted by the application. Retention is an operator
decision; a disabled-by-default scheduled job can prune rows older than
`AUDIT_RETENTION_DAYS` if set.

## Server

- `audit.record(tx, ctx, { action, entityType, entityId, before, after, metadata })`
  takes the transaction handle so it commits with the change.
- `ctx` carries the actor. Requests build it from the session; jobs build a
  `{ actorType: 'job', jobId }` context; scripts use `system`.
- Snapshots are the API-shaped record (after passing through the entity's
  serializer), so secrets or internal columns never land in the log.
- `GET /api/audit?entityType&entityId&actorId&action&from&to&page` for the global
  page, permission `audit:read`.
- `GET /api/<plural>/:id/history` is a thin wrapper filtered to one record and
  requires the entity's `read` permission.

## Client

- `/audit` page: `DataTable` over the log with filters for actor, action, entity
  type, date range. Row expands to show a field-by-field diff computed in the
  browser from `before` and `after`.
- `HistoryTab` on detail pages shows the same timeline for one record.

## As built (phase 3)

- `audit_log.at` is set from application time and a `seq` identity column breaks ties;
  lists order by `(at, seq)`. Postgres `now()` is the transaction start time, so rows
  written in one transaction would otherwise tie.
- `platform/audit/service.ts`: `listAudit`, `entityHistory(entityType, id, params)`,
  `auditMeta()` (distinct actions and entity types for filters).
- Routes: `GET /api/audit`, `GET /api/audit/meta` (audit:read); each feature exposes
  `GET /api/<plural>/:id/history` behind its own read permission.
- Retention pruning job: phase 4.

## Done when

- Every write in the golden example produces exactly one row (bulk: one per record).
- A test helper `expectAudited(action, entityId)` exists and is used in feature tests.
- The diff view handles added, removed and changed fields, nested objects rendered as
  JSON.
