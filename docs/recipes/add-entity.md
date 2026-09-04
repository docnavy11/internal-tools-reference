# Recipe: add an entity

Validated in phase 4 by an agent that followed only this document and the files it
names to add a `vendors` entity; every gap it hit is fixed below. Copy from
`src/server/features/customers/`, `src/shared/features/customers/` and
`src/client/features/customers/`. Before starting, skim these platform files once so the
types make sense: `src/server/platform/db/columns.ts`, `src/shared/query.ts`,
`src/shared/api-types.ts`, `src/client/platform/data-table/types.ts` and
`use-list-params.ts`, `src/client/platform/form/entity-form.tsx`.

Running example: `vendors` with fields `name`, `email`, `status` (`active`,
`inactive`), `ownerId`.

## 1. Shared schema

Create `src/shared/features/vendors/schema.ts`. Every block below is required; the
list page, bulk bar and CSV export depend on all of them.

```ts
import { z } from 'zod';
import type { BulkResult } from '../../api-types';
import { csvArray } from '../../query';
import { userRefSchema } from '../../user-ref';

export const vendorStatuses = ['active', 'inactive'] as const;
export const vendorStatus = z.enum(vendorStatuses);

// Full record as returned by the API. deletedAt is part of it: entities are soft-deleted.
export const vendorSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email().nullable(),
  status: vendorStatus,
  owner: userRefSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
});
export type Vendor = z.infer<typeof vendorSchema>;

// Create body, written by hand (not picked from vendorSchema) so optional fields carry
// defaults and a body may omit them. PATCH takes the partial.
export const vendorInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().trim().email().max(320).nullable().default(null),
  status: vendorStatus.default('active'),
  ownerId: z.string().uuid().nullable().default(null),
});
export type VendorInput = z.infer<typeof vendorInput>;
export const vendorPatch = vendorInput.partial();

// List filters. `q` powers the search box (DataTable always sends it) and
// `includeDeleted` the "show deleted" toggle; multi-value filters use csvArray.
export const vendorFilters = z.object({
  q: z.string().max(200).optional(),
  status: csvArray(vendorStatus),
  ownerId: z.string().uuid().optional(),
  includeDeleted: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

// Columns the API accepts in `sort`; column ids in the client table must match.
export const vendorSortColumns = ['name', 'email', 'status', 'createdAt', 'updatedAt'] as const;

export const vendorBulkInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set_status'), ids: z.array(z.string().uuid()).min(1).max(200), status: vendorStatus }),
  z.object({ action: z.literal('delete'), ids: z.array(z.string().uuid()).min(1).max(200) }),
]);
export type { BulkResult };
```

Add permission strings `vendors:read`, `vendors:write`, `vendors:delete` to
`src/shared/permissions.ts` and assign them to roles. The default split used by
customers is: admin everything, member read and write, viewer read.

## 2. Table and migration

Create `src/server/features/vendors/table.ts` using the column helpers:

```ts
export const vendors = pgTable(
  'vendors',
  {
    ...id(),
    name: text('name').notNull(),
    email: text('email'),
    status: text('status').notNull().default('active'),
    ownerId: uuid('owner_id').references(() => users.id),
    ...actorColumns(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    // enumCheck keeps the constraint in step with the shared enum array.
    check('vendors_status_check', enumCheck(t.status, vendorStatuses)),
    index('vendors_owner_idx').on(t.ownerId),
    index('vendors_live_idx').on(t.createdAt).where(sql`${t.deletedAt} is null`),
  ],
);
```

`enumCheck`, `id`, `timestamps`, `softDelete` come from `platform/db/columns.ts`;
`actorColumns` and `users` from `platform/auth/table.ts`.

Export it from `src/server/platform/db/schema.ts` (the registry Drizzle reads). Run
`npm run db:generate`, read the SQL it produced, then `npm run db:migrate`.

## 3. Serializer and service

Create `serialize.ts` with `serializeVendor(row, owner): Vendor` (dates to ISO strings,
joined user as `{ id, name, email }`). Note the two similarly named things: the service's
local `sortColumns` maps names to Drizzle columns for `orderBy`; the shared
`vendorSortColumns` is the string allowlist the route validates against. This is the API shape and what lands in audit
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

Copy `tests/e2e/customers.spec.ts` to `tests/e2e/vendors.spec.ts` and adjust names,
fields and routes; run it with `npm run build && npm run test:e2e`.

Create `tests/server/vendors.test.ts` from `tests/server/customers.test.ts`: permissions
per role, create with defaults and audit snapshot, validation envelope, update with
before/after, list filters/search/sort/paging, soft delete and restore with history
order, bulk auditing per record, CSV escaping. Use `signInAs` and `auditRows` from
`tests/server/helpers.ts`. Remember rows created inside one test share a Postgres
`now()`, so never rely on `createdAt` ordering in a test; pass an explicit `sort`.

## 8. Seed and docs

Add a few rows to `src/server/platform/db/seed.ts` (not `src/server/scripts/seed.ts`,
which is only the CLI entry point), guarded like the customers rows so the seed stays
idempotent. If the entity has a job or a setting, follow the
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
