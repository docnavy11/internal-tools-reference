import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { customerPlans, customerStatuses } from '../../../shared/features/customers/schema';
import { actorColumns, users } from '../../platform/auth/table';
import { enumCheck, id, softDelete, timestamps } from '../../platform/db/columns';

// Golden example. Mirrors src/shared/features/customers/schema.ts by hand (adr/0008).
export const customers = pgTable(
  'customers',
  {
    ...id(),
    name: text('name').notNull(),
    email: text('email'),
    status: text('status').notNull().default('lead'),
    plan: text('plan').notNull().default('free'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ownerId: uuid('owner_id').references(() => users.id),
    notes: text('notes'),
    ...actorColumns(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    check('customers_status_check', enumCheck(t.status, customerStatuses)),
    check('customers_plan_check', enumCheck(t.plan, customerPlans)),
    index('customers_owner_idx').on(t.ownerId),
    index('customers_status_idx').on(t.status),
    index('customers_created_by_idx').on(t.createdBy),
    index('customers_updated_by_idx').on(t.updatedBy),
    // Partial index for the default "not deleted" listing.
    index('customers_live_idx')
      .on(t.createdAt)
      .where(sql`${t.deletedAt} is null`),
  ],
);
