# Recipe: add an entity

Target procedure. It will be verified against the `customers` golden example during
phase 3 and corrected where the code disagrees. Until then treat it as the intended
shape.

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

## 3. Service

Create `service.ts` with `list`, `get`, `create`, `update`, `remove`, `bulk`, plus
`serialize(row): Vendor`. Every write is `withTransaction` and calls
`audit.record(tx, ctx, ...)`. Sort allowlist is declared here. Copy the shape from
`customers/service.ts`; do not invent a different one.

## 4. Routes

Create `routes.ts` mapping the CRUD API contract (`../blocks/04-crud-kit.md`) onto
the service. Each route: `requirePermission`, `zValidator`, call service, return.
Add `GET /:id/history` through the audit helper and `?format=csv` through
`csvStream`.

## 5. Register on the server

Create `index.ts` exporting `registerVendors(app)` and add one line to
`src/server/features/index.ts`.

## 6. Client

Create `src/client/features/vendors/`:

- `list.tsx`: `DataTable` with columns, filters from `vendorFilters`, export URL,
  bulk actions, row link to detail.
- `detail.tsx`: `DetailPage` with `FieldList`, actions, `HistoryTab`.
- `form.tsx`: `EntityForm` over `vendorInput` with the field components.
- `nav.ts`: navigation entry.
- `routes.tsx`: route objects for `/vendors`, `/vendors/new`, `/vendors/:id`,
  `/vendors/:id/edit`.

Add one import line in `src/client/router.tsx`.

## 7. Tests

Create `tests/server/features/vendors.test.ts` from the customers test: list
filtering, create with audit, update with audit, soft delete hides from list,
viewer gets 403 on write, sort allowlist, CSV export header row. Add the drift test
that a serialized row passes `vendorSchema`.

## 8. Seed and docs

Add a few rows to `seed.ts`. If the entity has a job or a setting, follow the
matching recipe. Run `npm run check` (typecheck, lint, tests). Done.

## Checklist

- [ ] schema.ts with record, input, filters
- [ ] permissions added to roles
- [ ] table.ts, exported from schema registry, migration generated and applied
- [ ] service.ts with audit on every write
- [ ] routes.ts with permission on every route
- [ ] server index.ts registered
- [ ] list, detail, form, nav, routes on the client, registered
- [ ] tests including audit and permission checks
- [ ] seed rows
