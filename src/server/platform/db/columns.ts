import { sql, type SQL } from 'drizzle-orm';
import { timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

// Column helpers so every table has the same shape. Spread them into pgTable().

export const id = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
});

export const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const softDelete = () => ({
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// `check('x_status_check', enumCheck(t.status, statuses))` keeps the database constraint
// in step with the shared Zod enum instead of a hand-typed literal list.
export function enumCheck(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(', '))})`;
}
