# 03 Data layer

Postgres 16, Drizzle for tables and migrations, core query builder only
(`../adr/0008`).

## Pieces

- `platform/db/client.ts`: a `pg` pool from `DATABASE_URL`, Drizzle instance,
  `withTransaction(fn)` helper that passes a transaction-bound `db` into `fn`.
- `platform/db/migrate.ts`: runs Drizzle migrations from `drizzle/`. Invoked by
  `npm run db:migrate` and at boot when `MIGRATE_ON_START=true`.
- `platform/db/seed.ts`: idempotent development seed: an admin user for dev login,
  a handful of customers and notes. `npm run db:seed`. Refuses to run when
  `NODE_ENV === 'production'`.
- `platform/db/columns.ts`: shared column helpers `id()`, `timestamps()`,
  `softDelete()` so every table gets the same shape. `actorColumns()` lives next to the
  `users` table in `platform/auth/table.ts` because it references it.
- `platform/db/pagination.ts`: `paginate(query, { page, pageSize, sort, order })`
  returning `{ items, total, page, pageSize }`, with `pageSize` capped at 200.

## Conventions

See `../ARCHITECTURE.md` section 5. In addition:

- Indexes are declared in `table.ts` next to the table. Every foreign key gets an
  index. Every `deleted_at` column gets a partial index `where deleted_at is null`
  when the table is expected to grow.
- Full-text search: a `search_vector tsvector` generated column on entities that
  need `q` search, with a GIN index. Simple `ilike` on a couple of columns is fine
  for small tables; the recipe says which to pick.
- `updated_at` is set by the service on every update, not by a trigger.

## Scripts

| Script | Does |
|---|---|
| `db:generate` | `drizzle-kit generate` from table definitions into `drizzle/` |
| `db:migrate` | apply pending migrations |
| `db:seed` | development seed |
| `db:reset` | drop and recreate the dev database, migrate, seed. Refuses in production and asks for confirmation. Development only. |
| `db:studio` | `drizzle-kit studio` for browsing |

## Tests

`tests/server/global-setup.ts` runs migrations against `DATABASE_URL_TEST` once per
run. `tests/server/setup.ts` gives each test a transaction that is rolled back
afterwards (code under test joins it through `getDb()`; nested transactions become
savepoints). Tests never mock the database.

## Done when

- `docker compose up` gives a migrated, seeded database.
- Migration generation, apply, and rollback-by-new-migration are documented in the
  recipe.
- A drift test asserts the seed rows satisfy the shared Zod schemas.
