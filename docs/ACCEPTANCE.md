# Acceptance ledger

Every "done when" item from `docs/blocks/`, with the evidence that proves it or an honest
"not verified". Compiled 2026-09-04 from the final fresh-clone verification. When you
add evidence, update this file in the same change.

Legend: T = automated test, M = manual check recorded in the docs, N = not verified.

## 01 Auth

| Item | Status | Evidence |
|---|---|---|
| Google sign-in against a real client | N | Fake OIDC provider only (`tests/server/oidc.test.ts`, `auth-routes.test.ts`) |
| Microsoft flow against a real tenant | N | Fake provider with tenant allowlist tests |
| Magic link end to end with console driver | T | `magic-link.test.ts`, `auth-routes.test.ts`, `security-fixes.test.ts` |
| State / nonce / expiry / disabled / first admin / domain policy / session sliding | T | `oidc.test.ts`, `policy.test.ts`, `sessions.test.ts` |
| Login CSRF (state cookie), tenant allowlist, redirect hardening | T | `auth-routes.test.ts`, `oidc.test.ts` |

## 02 Authorization

| Item | Status | Evidence |
|---|---|---|
| Route coverage test | T | `authz-coverage.test.ts` (also rejects stray `publicRoute`) |
| Viewer 403 on write, member refused users page, admin allowed | T | `users-routes.test.ts`, `customers.test.ts`, e2e `auth.spec.ts` |
| Restore and history routes by role | T | `customers.test.ts` |
| Last admin under concurrency | T | `security-fixes.test.ts` |

## 03 Data layer

| Item | Status | Evidence |
|---|---|---|
| `docker compose up` gives a migrated database | M | Phase 1 and final verification runs |
| Migration generate / apply / rollback-by-new-migration documented | M | `recipes/add-entity.md` step 2 |
| Seed rows satisfy the shared schemas | T | `seed-drift.test.ts` |

## 04 CRUD kit

| Item | Status | Evidence |
|---|---|---|
| Golden example uses only kit components | M | Code review; no automated check |
| CSV export matches the filtered list; import with line-numbered rejections | T | `customers.test.ts`, `jobs.test.ts`, e2e `customers.spec.ts`, `jobs.spec.ts` |
| Bulk status change audited per row | T | `customers.test.ts` |
| List params, sort allowlist, CSV escaping, import validation, unknown PATCH fields ignored | T | `customers.test.ts`, `jobs.test.ts` |

## 05 Audit log

| Item | Status | Evidence |
|---|---|---|
| Exactly one row per write (bulk: per record) | T | `customers.test.ts` |
| `expectAudited` helper used in feature tests | T | `tests/server/helpers.ts` |
| Diff view handles added / removed / changed / nested | M | e2e `customers.spec.ts` checks a field diff renders; added/removed/nested rendering reviewed by hand only |

## 06 Jobs and cron

| Item | Status | Evidence |
|---|---|---|
| Exclusive claims under concurrent workers | T | `jobs.test.ts` (three workers, real pool) |
| Retry with backoff, dead after max, dedupe, reaper, timeout | T | `jobs.test.ts` |
| Scheduler fires once across concurrent schedulers | T | `jobs.test.ts` (three ticks, real pool) |
| Golden example enqueues in a transaction; nightly schedule exists | T | `jobs.test.ts` |
| Worker as a separate compose service | M | `docker compose --profile split`, verified 2026-09-04 |

## 07 Integrations

| Item | Status | Evidence |
|---|---|---|
| Vendor client retries, no retry on 400, timeout, idempotency key | T | `vendor-client.test.ts` |
| Signature valid / invalid / stale, duplicates, handler failure, replay | T | `webhooks.test.ts`, e2e `settings.spec.ts` |
| Empty secret refused | T | `security-fixes.test.ts` |

## 08 Notifications

| Item | Status | Evidence |
|---|---|---|
| Magic link email through the pipeline | T | `magic-link.test.ts`, `security-fixes.test.ts` |
| Slack post on customer creation, gated by setting | T | `notes.test.ts`, `settings.test.ts` |
| Slack `ok: false` retry vs permanent | T | `notify.test.ts` (bot driver with fake fetch) |
| SMTP driver against a real server | N | Console driver only |
| Console driver withholds bodies outside development | N | Code path exists; not asserted |

## 09 Storage

| Item | Status | Evidence |
|---|---|---|
| Attachment round trip with disk driver | T | `storage.test.ts`, `notes.test.ts`, e2e `notes.spec.ts` |
| S3 driver | M | Round-tripped once against MinIO (`docker compose --profile s3`); not automated; not against AWS or R2 |
| Size limit, sniffing, download permission, soft delete hides, purge removes row and bytes | T | `storage.test.ts`, `notes.test.ts` |
| Oversized multipart refused before buffering | T | `notes.test.ts` |

## 10 Settings and flags

| Item | Status | Evidence |
|---|---|---|
| Default when unset, invalid stored value falls back, set audited, reset | T | `settings.test.ts` |
| Fallback is logged; 30 s cache TTL | N | Code path exists; not asserted |
| Golden example reads a setting | T | `settings.test.ts` |
| Registry-driven page | T | e2e `settings.spec.ts` |

## 11 Observability

| Item | Status | Evidence |
|---|---|---|
| Redaction, `readyz` 503, generic 500 with request id, client errors endpoint | T | `hardening.test.ts` |
| Request id echoed / validated | T | `app.test.ts` |
| Trace from browser error page to log line | N | Reporter verified by hand during phase 7; no permanent test |
| CONFIG.md / env.ts / .env.example agree | T | `hardening.test.ts` |
| Security headers on every response | T | `hardening.test.ts`, final container check |

## 12 UI shell

| Item | Status | Evidence |
|---|---|---|
| Navigation by permission; admin reaches every page; viewer sees only permitted | T | e2e `auth.spec.ts`, `palette.spec.ts`, `settings.spec.ts`, `jobs.spec.ts` |
| Golden pages use only kit components | M | Code review |
| Dark mode readable everywhere | M | Screenshots reviewed by hand; no automated contrast check |
| Command palette | T | e2e `palette.spec.ts` |
| Code splitting | M | Build output recorded in block 12 |
