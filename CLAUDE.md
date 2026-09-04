# CLAUDE.md

Conventions for anyone changing this repository, human or agent.

## Status

Phase 1 (skeleton) is implemented: build, env validation, database and migrations,
HTTP platform, health endpoints, APP_MODE switch, placeholder page, tests, Docker,
CI. Phases 2 to 7 in `docs/BUILD_PLAN.md` are not started. Update this section as
phases land.

## Read first

1. `docs/ARCHITECTURE.md` for the shape and conventions.
2. The block spec in `docs/blocks/` for the area you are touching.
3. The recipe in `docs/recipes/` if you are adding an entity, job, integration or
   setting. Follow it literally; if it is wrong, fix the recipe in the same change.
4. `docs/adr/` before proposing a different library or pattern. `adr/0002` explains
   why some choices look conservative.

## Hard rules

- A feature is one folder in each of `src/shared/features`, `src/server/features`,
  `src/client/features`, with the fixed file names from `adr/0010`. Do not put
  feature code in `platform/`.
- Every write goes through a service, inside `withTransaction`, and calls
  `audit.record()` in that transaction. No writes from routes or jobs directly.
- Every route under `/api` has `requirePermission()` or the `publicRoute` marker.
- Zod schemas in `src/shared` are the source of truth for shapes. Drizzle tables
  mirror them by hand. Do not add schema generation.
- Network calls that change external state run in jobs, not in request handlers.
- `process.env` is read only in `src/server/env.ts`. New variables go there, in
  `.env.example`, and in `docs/CONFIG.md`, in the same change.
- Migrations are generated with `npm run db:generate`, reviewed, committed. Never
  edit a migration that has been applied anywhere. Never delete the database to fix
  a schema problem; write a new migration.
- No new dependency without adding it to the table in `docs/ARCHITECTURE.md`
  section 2. If it is not the obvious popular choice, add an ADR.
- Dependency versions are pinned exactly. Upgrading a major is deliberate work with
  its own commit and a check of the ADR that chose the version.
- Zod stays on major 3 (`adr/0007`). Drizzle relational queries are not used
  (`adr/0008`).
- The Vite client bundle must never import from `src/server`. Shared code goes in
  `src/shared` and must not use Node or DOM APIs.
- CLI entry points go in `src/server/scripts/` only. Never detect "run directly" with
  `import.meta.url` in a library module: the server is bundled into one file, so the
  check is always true and the code runs on import.
- Tests use the real test database through the per-test transaction in
  `tests/server/setup.ts`. Never mock the database. Never point tests at the dev
  database.

## Before finishing a change

- `npm run check` passes: typecheck, lint, Vitest.
- Feature changes include tests for permissions and audit.
- Docs that describe the changed behaviour are updated in the same commit.

## Development

- `cp .env.example .env`, `docker compose up -d postgres`, `npm run db:migrate`,
  `npm run db:seed`, `npm run dev`. API on 3000, client on 5174, Postgres on 5439.
- `npm run check` runs typecheck, lint and Vitest. `npm run build && npm run test:e2e`
  runs Playwright against the built app on port 3100.
- `npm run db:reset` is for the local development database only. It asks for
  confirmation and refuses when `NODE_ENV=production`.
- After changing a table: `npm run db:generate`, read the SQL, `npm run db:migrate`.
