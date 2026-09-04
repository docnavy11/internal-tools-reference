import { timestamp, uuid } from 'drizzle-orm/pg-core';

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
