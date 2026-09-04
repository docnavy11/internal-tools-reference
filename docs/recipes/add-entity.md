# Recipe: add an entity

Server steps (1 to 5, 7, 8) were corrected against the `customers` golden example in
phase 3; copy from `src/server/features/customers/` and `src/shared/features/customers/`.
Client steps follow the same example under `src/client/features/customers/`.

Running example: `vendors` with fields `name`, `email`, `status` (`active`,
`inactive`), `ownerId`.

## 1. Shared schema

Create `src/shared/features/vendors/schema.ts`:

```ts
import { z } from 'zod';

export const vendorStatus = z.enum(['active', 'inactive']);

export const vendorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  email: z.string().email().nullable(),
  status: vendorStatus,
  ownerId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
});
export type Vendor = z.infer<typeof vendorSchema>;

export const vendorInput = vendorSchema.pick({ name: true, email: true, status: true, ownerId: true });
export type VendorInput = z.infer<typeof vendorInput>;

export const vendorFilters = z.object({
  status: z.array(vendorStatus).optional(),
  ownerId: z.string().uuid().optional(),
});
```

Multi-value filters use `csvArray(...)` from `src/shared/query.ts` (one query parameter,
comma-separated). Give optional create fields a `.default(...)` so a body may omit them.

Add permission strings `vendors:read`, `vendors:write`, `vendors:delete` to
`src/shared/permissions.ts` and assign them to roles.

## 2. Table and migration

Create `src/server/features/vendors/table.ts` using the column helpers:

```ts
export const vendors = pgTable('vendors', {
  ...id(),
  name: text('name').notNull(),
  email: text('email'),
  status: text('status').notNull().default('active'),
  ownerId: uuid('owner_id').references(() => users.id),
  ...actorColumns(),
  ...timestamps(),
  ...softDelete(),
}, (t) => [
  check('vendors_status_check', sql`${t.status} in ('active','inactive')`),
  index('vendors_owner_idx').on(t.ownerId),
]);
```

Export it from `src/server/platform/db/schema.ts` (the registry Drizzle reads). Run
`npm run db:generate`, read the SQL it produced, then `npm run db:migrate`.

## 3. Serializer and service

Create `serialize.ts` with `serializeVendor(row, owner): Vendor` (dates to ISO strings,
joined user as `{ id, name, email }`). This is the API shape and what lands in audit
snapshots, so nothing internal leaks.

Create `service.ts` from `customers/service.ts`: `whereFor(filters)`, `baseQuery(db)`
with the owner join, `listVendors`, `iterateVendors` (CSV), `getVendor`, `createVendor`,
`updateVendor`, `deleteVendor` (soft), `restoreVendor`, `bulkVendors`. Every write is
`withTransaction` and calls `recordAudit(tx, actor, ...)` with before and after
snapshots. The sort allowlist (`sortColumns`) lives here.

## 4. Routes

Create `routes.ts` from `customers/routes.ts`: one `requirePermission(...)` per verb,
`validate('json' | 'param' | 'query', schema)` from `platform/http/validate.ts` (never
`zValidator` directly), then a service call. Includes `?format=csv` via `csvResponse`
with a `csvColumns` list, `POST /bulk` (delete action checks the delete permission),
`POST /:id/restore`, and `GET /:id/history` via `entityHistory('vendor', id, params)`.

## 5. Register on the server

Create `index.ts` exporting `registerVendors(api)` that does `api.route('/', vendorRoutes())`
and add one line to `src/server/features/index.ts`. The authorization coverage test
fails if any new route lacks a permission marker.

## 6. Client

Create `src/client/features/vendors/` by copying `src/client/features/customers/`:

- `api.ts`: query key, `fetchVendorPage(searchParams)`, `vendorsExportUrl(searchParams)`,
  `useVendor(id)` and one mutation hook per verb (create, update, delete, restore, bulk),
  all invalidating the feature's query key.
- `list.tsx`: `useListParams(vendorFilters, { defaultSort })`, a `ColumnDef[]` whose
  `id`s match `vendorSortColumns` (those get sort buttons), a `FilterDef[]` declaring
  the filter bar, bulk actions, then `<DataTable …/>`.
- `detail.tsx`: `DetailPage` with `FieldList`, tabs Details and History
  (`HistoryTab` pointed at `/api/vendors/:id/history`), actions edit, delete, restore.
- `form.tsx`: one `EntityForm` over `vendorInput` with field components from
  `client/platform/form`, exported as a create page and an edit page.
- `nav.ts`: exports a named `NavEntry` constant (`vendorsNav`).
- `routes.tsx`: exports `vendorRoutes: RouteObject[]`, every element wrapped in
  `RequirePermission`, `handle.title` for breadcrumbs.

Register with two lines: spread `vendorRoutes` into the shell's children in
`src/client/router.tsx`, and add `vendorsNav` to `navEntries` in
`src/client/platform/shell/nav.ts`.

## 7. Tests

Create `tests/server/vendors.test.ts` from `tests/server/customers.test.ts`: permissions
per role, create with defaults and audit snapshot, validation envelope, update with
before/after, list filters/search/sort/paging, soft delete and restore with history
order, bulk auditing per record, CSV escaping. Use `signInAs` and `auditRows` from
`tests/server/helpers.ts`. Remember rows created inside one test share a Postgres
`now()`, so never rely on `createdAt` ordering in a test; pass an explicit `sort`.

## 8. Seed and docs

Add a few rows to `seed.ts`. If the entity has a job or a setting, follow the
matching recipe. Run `npm run check` (typecheck, lint, tests). Done.

## Checklist

- [ ] schema.ts with record, input (defaults for optional fields), filters, sort columns, bulk input
- [ ] permissions added to roles
- [ ] table.ts, exported from schema registry, migration generated and applied
- [ ] serialize.ts
- [ ] service.ts with audit on every write
- [ ] routes.ts with permission on every route, using validate()
- [ ] server index.ts registered
- [ ] api, list, detail, form, nav, routes on the client; two registration lines
- [ ] Playwright spec copied from `tests/e2e/customers.spec.ts`
- [ ] tests including audit and permission checks
- [ ] seed rows
