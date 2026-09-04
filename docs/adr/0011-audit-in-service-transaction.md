# 0011 Audit entries are written by services, inside the write transaction

Accepted, 2026-09-04

## Context

Audit logging can be done with database triggers, with HTTP middleware, or
explicitly in the code that performs the change. Triggers capture everything but
lose the actor and the intent. Middleware sees the request but not the before and
after state.

## Decision

Services call `audit.record({ action, entityType, entityId, before, after })`
inside the same transaction as the change. The actor and request id come from the
request context passed into the service. Jobs pass a system actor. The
`audit_log` row is committed or rolled back together with the change.

## Consequences

- A forgotten audit call is a code review failure, not a silent gap. The recipe
  and the golden example make the call impossible to miss, and a test per feature
  asserts an audit row exists after create, update and delete.
- Before and after snapshots are full JSON of the record, so history views can
  diff at display time without a diff format decision now.
- No triggers to maintain across migrations.
