# Build plan

Seven phases. Each has acceptance criteria that must pass before the next starts,
because each later phase depends on the earlier ones being trustworthy. "Tests" means
Vitest against a real Postgres unless stated. Estimated sizes are relative, not hours.

## Phase 1: skeleton (small) — implemented 2026-09-04

Build tooling, database, container, CI, health.

- `package.json` with pinned versions, `npm run dev` (Vite dev server proxying `/api`
  to the Hono server with reload), `build`, `start`, `check`.
- `env.ts` with Zod validation and a readable failure message.
- Drizzle set up, `users` table only, migration generated and applied.
- Hono app with request id, logging, error handler, `/healthz`, `/readyz`, static
  serving of `dist/client` with SPA fallback.
- `main.ts` with `APP_MODE` switch (worker is a stub that logs and idles).
- shadcn and Tailwind initialised with their CLI; one placeholder page renders.
- Dockerfile, `docker-compose.yml`, `.env.example`, `.gitignore`.
- GitHub Actions: typecheck, lint, tests with Postgres service, Docker build.
- Vitest setup with transactional tests. Playwright installed with one test that
  loads the placeholder page from the built image.

Accept when: `docker compose up` serves the page; CI is green; `npm run check` passes.

## Phase 2: auth, authorization, shell (medium) — implemented 2026-09-04

Blocks 01, 02, 12. As built: server side by the lead (43 Vitest tests), client shell,
login and users page by an agent against the shared contract in `src/shared/auth.ts`
and `src/shared/features/users/schema.ts`, 8 Playwright tests. Google and Microsoft
flows are verified against a fake OIDC provider with locally signed tokens, not yet
against real tenants; do that once a real client id exists and record it in block 01.

- Sessions, OIDC client, Google and Microsoft config, magic link, dev login, logout,
  `/api/me`.
- Permissions file, `requireAuth`, `requirePermission`, route coverage test.
- Users admin page with invite, role change, disable, revoke sessions. Audit table
  and `audit.record()` arrive here in minimal form because users actions must be
  audited; the audit UI comes in phase 3.
- Shell: sidebar, top bar, theme, toasts, login page, session provider, error
  boundary, not-found and no-access pages.

Accept when: sign in with Google works against a real client id; block 01 and 02
tests pass; Playwright logs in via dev login and reaches the users page as admin and
is refused as viewer.

## Phase 3: CRUD kit, audit, customers example (large)

Blocks 04, 05, and the `customers` golden example.

- `DataTable`, filter bar, `useListParams`, `EntityForm`, field components,
  `DetailPage`, `HistoryTab`, `ConfirmDialog`, `EmptyState`, `StatusBadge`.
- Server helpers: `listQuery`, `paginate`, `csvStream`, `parseCsv`.
- `customers` in all three layers with list, detail, form, bulk status change, CSV
  export, soft delete, history.
- Audit page with diff view.
- `recipes/add-entity.md` corrected against what was actually written.

Accept when: block 04 and 05 tests pass; Playwright creates a customer, finds it in
the list, sees the audit entry, downloads a CSV; the recipe was followed once by
Claude Code to add a throwaway second entity without needing to read platform code,
then the throwaway was deleted.

## Phase 4: jobs and cron (medium)

Block 06.

- Jobs table, `defineJob`, `enqueue`, worker loop, reaper, scheduler, graceful
  shutdown, cleanup job.
- Jobs admin page with retry, cancel, schedules, run now.
- `customers` gets a nightly recompute job enqueued inside a transaction on create.
- CSV import for customers as a job.
- `recipes/add-job.md` corrected.

Accept when: block 06 tests pass including the two-worker exclusivity test; worker
mode runs as a separate compose service and processes jobs from web mode.

## Phase 5: storage and notifications, notes example (medium)

Blocks 08, 09, and the `notes` golden example.

- Storage adapter with disk and S3 drivers, files table, upload and download
  routes, sniffing, limits, trash job. MinIO in compose for the S3 check.
- Email and Slack adapters, drivers, notify jobs, templates. Magic link switched
  to the pipeline.
- `notes` as a child of customers with an attachment, shown as a detail tab.
- Slack post on customer creation.

Accept when: block 08 and 09 tests pass; a file round-trips with both drivers.

## Phase 6: settings, integrations (medium)

Blocks 07, 10.

- Settings registry, cache, page, audit. Customers reads `slack_on_create`.
- Vendor client helper, webhook inbox, verify helpers, processing job, webhooks
  admin page.
- `integrations/example-vendor` with tests.
- `recipes/add-integration.md` and `add-setting.md` corrected.

Accept when: block 07 and 10 tests pass; a signed webhook lands, is processed, and
shows in the admin page; a duplicate is ignored.

## Phase 7: hardening and handover (medium)

Block 11 completion, security pass, docs.

- Security headers, rate limiting, redaction review, client error reporting,
  Sentry driver file.
- Security review of auth code against the OIDC flow checklist in block 01.
- Full Playwright smoke suite. Today Playwright and the CI e2e job run
  `node dist/server/main.js` on the host; this phase adds a CI step that runs the
  smoke suite against the Docker image so the image itself is exercised.
- Command palette.
- README quick start, `CONFIG.md` verified against `env.ts` by a test that fails if
  a variable exists in one and not the other.
- `CLAUDE.md` updated to reflect the code as built. Status lines in the docs
  changed from "design" to "implemented".

Accept when: a fresh clone reaches a running, seeded app by following only the
README; every block's "done when" list is checked.

## Working rules during the build

- One phase per branch or per commit series, phase number in the commit subject.
- No dependency is added without a line in `ARCHITECTURE.md` section 2 and, if it
  is not the obvious choice, an ADR.
- When the code and a doc disagree, fix the doc in the same commit.
