# Architecture

Reference template for internal tools at startups. One repository, cloned per tool,
that already solves the twelve things every internal tool needs so that building the
actual application is mostly adding entities and integrations.

Status: **phase 1 (skeleton) implemented.** See `BUILD_PLAN.md` for what each phase
adds. Where this document and the code disagree, the code was checked more recently;
fix the document.

## 1. Goals and non-goals

Goals

- A builder (a person or Claude Code) can add a complete entity, with list, detail,
  form, permissions, audit trail and tests, by following `recipes/add-entity.md`
  without inventing anything.
- Everything is plain, readable code that a startup team can take over. No framework
  of our own, no code generation, no runtime magic.
- Deploys anywhere a Docker image and a Postgres database can run.
- Technology chosen for depth of familiarity and API stability over novelty
  (see `adr/0002`).

Non-goals

- Multi-tenancy. One deployment serves one company (`adr/0013`).
- Public-facing traffic, self-service signup, or billing.
- Being a library. This is a starting point that is meant to diverge.

## 2. Technology

Every choice below was filtered on two questions: is it common enough that a startup
team will know it, and do I (the builder) know its current major version deeply?
Where a popular library failed the second test it was replaced by a small amount of
plain code or by an older, stable tool. Versions are target majors; exact pins are set
at build time and recorded in `package.json`.

| Area | Choice | Target | Notes |
|---|---|---|---|
| Runtime | Node.js | 22 LTS | Supported into 2027. |
| Language | TypeScript, strict | 5.x | `noUncheckedIndexedAccess` on. |
| Package manager | npm | bundled | Single package, no workspaces. Switch to pnpm is one line if the team prefers. |
| Server | Hono + `@hono/node-server` | 4.x / 1.x | Small, stable API, standard Request/Response. |
| Server build | esbuild | 0.2x | Bundles `src/server/main.ts` into one ESM file; dependencies stay external. Avoids the `.js`-extension and path-alias problems of plain `tsc` output. |
| Dev runner | tsx, concurrently | 4.x / 10.x | `npm run dev` runs the API with reload and the Vite dev server side by side. |
| Database | PostgreSQL | 16 | Only external dependency. |
| DB access | Drizzle ORM + drizzle-kit | 0.4x | Core query builder and migrations only; see `adr/0008`. |
| Validation | Zod + `@hono/zod-validator` | 3.x pinned | Deliberately not 4; see `adr/0007`. The validator is wrapped in `platform/http/validate.ts` so failures use the error envelope. |
| Auth | Own code: generic OIDC client + session table | n/a | `jose` for ID token verification. See `adr/0005`. |
| Jobs | Own code: Postgres table + `SKIP LOCKED` worker | n/a | `cron-parser` for schedules. See `adr/0006`. |
| Front end | React + Vite | 19 / current | SPA, no server rendering. |
| Routing | React Router, data router API | 7.x library mode | Same API as v6.4+. Not framework mode. |
| Server state | TanStack Query | 5.x | |
| Tables | TanStack Table | 8.x | Headless; rendered with shadcn table primitives. |
| Forms | react-hook-form + `@hookform/resolvers/zod` | 7.x | |
| UI | shadcn/ui on Tailwind CSS | shadcn CLI 4, Tailwind 4 | Components are copied into `src/client/platform/ui`. The CLI installs the unified `radix-ui` package, `class-variance-authority`, `lucide-react`, `tw-animate-css` and the Geist font. See `adr/0009`. |
| Logging | pino | 9.x | JSON to stdout. |
| Email | nodemailer over SMTP | 6.x | Works with any provider that offers SMTP. |
| Slack | plain `fetch` to `chat.postMessage` | n/a | No SDK. |
| Storage | `@aws-sdk/client-s3` + local disk driver | 3.x | S3-compatible: AWS, R2, MinIO. |
| CSV | papaparse | 5.x | Import parsing and export. |
| Dates | date-fns | 3.x/4.x | Plus native `Intl` for display. |
| Tests | Vitest, Playwright | current | Real Postgres in tests, no DB mocks. |
| Lint/format | ESLint flat config + Prettier | 9.x | |
| Container | Docker multi-stage, `node:22-alpine` | | |

Dependency split: `dependencies` holds only what the server process imports at
runtime (Hono, Drizzle, pg, pino, Zod). Everything bundled into the client by Vite
(React, React Router, TanStack Query, the shadcn packages) and all build tooling is in
`devDependencies`, so the production image installs with `--omit=dev` and stays small.

Local ports: API on 3000, Vite dev server on 5174 (proxies `/api`, `/healthz`,
`/readyz` to 3000), Postgres from compose on host port 5439. Non-default ports avoid
clashes with other projects on a developer machine; all are overridable.

## 3. System shape

One Docker image. One entry point, `src/server/main.ts`, that reads `APP_MODE`:

- `web`: serves the built SPA from `dist/client` and the API under `/api`.
- `worker`: runs the job worker and the cron scheduler.
- `all`: both in a single process. Default. Right for a single VPS.

Postgres is the only piece of infrastructure. Sessions, jobs, schedules, settings,
audit log, file metadata and webhook inbox all live in it. Anything that talks to
the outside world sits behind an adapter with a production driver and a local driver:

| Adapter | Production driver | Local driver |
|---|---|---|
| storage | S3-compatible bucket | disk under `./data/files` |
| email | SMTP | console (prints the message) |
| slack | bot token | console |
| errorReporter | optional Sentry wiring, off by default | console |

Adapters are selected by env vars at startup. The rest of the code never knows
which driver is active.

## 4. Repository layout

```
src/
  shared/                      imported by both client and server, no Node or DOM APIs
    permissions.ts             roles and permission strings
    api-types.ts               pagination envelope, error envelope
    features/<name>/schema.ts  Zod schemas: record, input, filters
  server/
    main.ts                    reads APP_MODE, starts web and/or worker
    app.ts                     Hono app: middleware, routes, static serving
    worker.ts                  job loop and cron tick
    env.ts                     Zod-validated process.env, the only place it is read
    scripts/                   CLI entry points only: migrate, seed, reset (see note below)
    platform/
      db/                      drizzle client, migration runner, transaction helper
      auth/                    oidc.ts, sessions.ts, magic-link.ts, routes.ts, middleware.ts
      authz/                   requirePermission middleware
      audit/                   record(), table, routes
      jobs/                    defineJob, enqueue, worker loop, schedules, routes
      storage/                 adapter, drivers
      notify/                  email and slack adapters, drivers, notify jobs
      settings/                defineSetting, cache, routes
      webhooks/                inbox table, verify helpers
      http/                    request id, logging, error handler, csrf, pagination helpers
      csv/                     export streaming, import parsing
    features/<name>/
      table.ts                 Drizzle table definition
      service.ts               all reads and writes for the entity, audit calls inside
      routes.ts                Hono routes: validate, authorize, call service
      jobs.ts                  optional background jobs for this feature
      index.ts                 registers routes, jobs, nav entry
    integrations/<vendor>/     outbound client and inbound webhook handler
  client/
    main.tsx, router.tsx
    platform/
      shell/                   layout, sidebar, top bar, command palette, theme
      data-table/              DataTable, filter bar, pagination, bulk actions, export
      form/                    field components bound to react-hook-form
      api/                     fetch client, query helpers, error mapping
      auth/                    session context, usePermission, login page
      ui/                      shadcn components, copied in
    features/<name>/
      list.tsx, detail.tsx, form.tsx, nav.ts
    pages/                     users, audit, jobs, settings, files admin pages
drizzle/                       generated SQL migrations, never edited after apply
tests/
  server/                      Vitest, real Postgres
  e2e/                         Playwright
docs/                          this documentation
Dockerfile, docker-compose.yml, .env.example, CLAUDE.md
```

A feature is exactly one folder in each of `shared`, `server`, `client`. Nothing
about a feature lives anywhere else except one import line in each layer's registry.
Cross-cutting concerns live in `platform/` and are not edited when adding a feature.

Import alias: `@/` maps to `src/`, so client code imports `@/client/platform/ui/button`
and `@/shared/api-types`. Server code uses relative imports (esbuild honours the alias
too, but relative paths keep server files greppable without the alias).

CLI entry points live only in `src/server/scripts/`. Library modules never detect
"am I being run directly" via `import.meta.url`: inside the esbuild bundle every module
shares the entry file's URL, so such a check is always true and the code runs at
import time. Phase 1 hit exactly this bug.

## 5. Conventions

Data

- Table names: `snake_case`, plural. Columns: `snake_case`. TypeScript: `camelCase`,
  mapped by Drizzle.
- Primary keys: `id uuid default gen_random_uuid()`.
- Every table: `created_at timestamptz default now()`, `updated_at timestamptz`.
  Entities users edit also get `created_by`, `updated_by` (uuid, nullable, FK users).
- Soft delete: `deleted_at timestamptz null` on user-facing entities. Default list
  queries exclude deleted rows. Hard delete is an admin-only, audited action.
- Enums: Postgres `text` with a `check` constraint generated from the Zod enum, not
  Postgres enum types (they are painful to migrate).
- Money: integer minor units plus a currency column. Never floats.
- Timestamps stored in UTC; the client formats in the browser's zone.

Schemas

- `src/shared/features/<name>/schema.ts` is the source of truth. It exports:
  `<name>Schema` (full record as returned by the API), `<name>Input` (create and
  update body), `<name>Filters` (list query params). Types are `z.infer` of these.
- The Drizzle table mirrors the schema by hand. No schema generation in either
  direction. Duplication is accepted for explicitness.

Server

- Routes do three things: validate, authorize, call the service. No business logic.
- Services own all reads and writes for their entity. Every write runs inside a
  transaction and calls `audit.record()` in the same transaction.
- Anything that calls the network (email, Slack, vendor APIs) runs in a job unless it
  is a read the user is waiting for.
- Errors thrown are `AppError(code, status, message, details?)`. The error handler
  turns anything else into a 500 with a request id and reports it.

Client

- URL search params hold list state (page, sort, filters) so views are shareable.
- Server state through TanStack Query only. No hand-rolled fetching in components.
- Permission checks in the UI hide controls. They are never the security boundary.

## 6. Request lifecycle

1. `requestId` middleware: reuse `x-request-id` if present, otherwise generate. Bound
   to the pino child logger for the request.
2. `session` middleware: read `sid` cookie, load session and user, attach to context.
   Expired or missing sessions leave the context anonymous.
3. `csrf` middleware: for non-GET requests, require an `Origin` header matching
   `APP_URL`. Cookies are `SameSite=Lax`, so this is defence in depth.
4. Route: `requireAuth()`, `requirePermission('customers:write')`, Zod validation of
   params, query and body.
5. Service: transaction, write, `audit.record()`, optional `jobs.enqueue()`.
6. Response: JSON. Lists use `{ items, total, page, pageSize }`. Errors use
   `{ error: { code, message, details?, requestId } }`.
7. Access log line with method, path, status, duration, user id, request id.

## 7. Cross-cutting models

Detailed per block in `blocks/`. Summary:

- **users**: id, email, name, avatar_url, role, status, last_login_at. Access is
  granted by email domain allowlist or explicit invitation. First user to log in
  becomes `admin` when the table is empty.
- **roles**: `admin`, `member`, `viewer`, defined in code with a permission list each.
  Permission strings are `<resource>:<verb>`.
- **sessions**: hashed token, user id, expiry, ip, user agent. 30-day sliding window.
- **audit_log**: actor, action, entity type and id, before and after JSON, request
  id. Written in the same transaction as the change.
- **jobs**: name, payload, status, attempts, run_at, locks, last error, dedupe key.
  **schedules**: cron expression per named schedule, last run, next run.
- **settings**: key, JSON value, updated_by. Typed registry in code decides which keys
  exist and their defaults. Feature flags are boolean settings.
- **files**: storage key, filename, content type, size, uploader, optional owning
  entity.
- **webhook_events**: vendor, external id, raw payload, received_at, processed_at.
  Unique on vendor plus external id.

## 8. Configuration

All configuration is env vars, read once in `src/server/env.ts`, validated with Zod,
and exported as a typed object. The process exits at boot with a readable message if
anything required is missing. The full list lives in `CONFIG.md` and every variable
also appears in `.env.example` with a comment.

Secrets never go in the settings table. Settings are for behaviour that admins may
change at runtime; env is for wiring and secrets.

## 9. Deployment

- `Dockerfile`: multi-stage. Stage one builds client and server. Stage two copies
  `dist/` and production `node_modules`. Runs as non-root.
- `docker-compose.yml`: `postgres` and `app` with `APP_MODE=all`. This is the single
  VPS story and also the local production-like check.
- Platforms with separate services (Fly, Railway, Render, Kubernetes): same image,
  one service with `APP_MODE=web`, one with `APP_MODE=worker`.
- Migrations: `npm run db:migrate` runs pending migrations. `MIGRATE_ON_START=true`
  makes the `web` or `all` process run them at boot, which is fine for one replica.
- Health: `GET /healthz` returns 200 when the process is up. `GET /readyz` also pings
  the database.
- Backups are the operator's job. The docs recommend a nightly `pg_dump` and say
  where the files volume lives when the disk driver is used.

## 10. Testing

- **Unit and API tests (Vitest)**: run against a real Postgres from
  `DATABASE_URL_TEST`. Each test file runs in a transaction that is rolled back, or
  truncates the tables it touches. API tests call `app.request()` directly, no
  network. Auth is exercised by inserting a session row and sending the cookie.
- **End-to-end (Playwright)**: three to five smoke tests against the built app with
  dev login enabled: log in, create an entity, see it in the list, see the audit
  entry, export CSV.
- **CI (GitHub Actions)**: typecheck, lint, Vitest with a Postgres service container,
  Docker build, Playwright on the built image.

## 11. Security baseline

- SSO or magic link only; no passwords stored.
- Session cookie: `HttpOnly`, `Secure` in production, `SameSite=Lax`. Tokens are
  random 256-bit values; only their SHA-256 hash is stored.
- Origin check on mutations. Rate limit on magic link requests and webhook endpoints
  (in-memory token bucket, per IP; good enough for internal scale).
- Permission checks on every route via middleware, never inside components.
- Webhook signatures verified before anything is stored. Raw payload kept for replay.
- Uploads: size limit, content type recorded from sniffing not the client header,
  served through the API with auth, never by public bucket URL.
- Security headers via a small middleware: CSP for the SPA, `X-Content-Type-Options`,
  `Referrer-Policy`, `frame-ancestors 'none'`.
- Dev login exists only when `NODE_ENV !== 'production'` and `AUTH_DEV_LOGIN=true`.

## 12. Golden examples

Two features ship with the template and are meant to be deleted or renamed:

- `customers`: name, email, status (enum), plan (enum), notes count, tags (text
  array), owner (user FK). Exercises list with filters and CSV export, detail page,
  create and edit form, bulk status change, soft delete, audit history, a nightly
  job that recomputes a derived field, and a Slack message on creation.
- `notes` (child of customers): body, author, optional file attachment. Exercises a
  parent-child relation, a tab on the detail page, file upload and download.

Plus one integration example: `integrations/example-vendor` with an outbound client
that lists something from a fake API and an inbound webhook that lands in the inbox
and is processed by a job. This exists so the recipe has a concrete reference.

## 13. Documents

- `BUILD_PLAN.md`: phases and acceptance criteria.
- `CONFIG.md`: every env var.
- `blocks/`: one file per building block, the spec to code from.
- `recipes/`: how to add an entity, a job, an integration, a setting.
- `adr/`: why each decision was taken.
- `../CLAUDE.md`: conventions for anyone, human or agent, changing this repo.
