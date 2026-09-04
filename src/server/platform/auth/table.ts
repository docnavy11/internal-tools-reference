import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { roles, userStatuses } from '../../../shared/permissions';
import { id, timestamps } from '../db/columns';

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const users = pgTable(
  'users',
  {
    ...id(),
    email: text('email').notNull().unique(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    role: text('role').notNull().default('member'),
    status: text('status').notNull().default('active'),
    invitedBy: uuid('invited_by').references((): AnyPgColumn => users.id),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    check('users_role_check', sql`${t.role} in (${inList(roles)})`),
    check('users_status_check', sql`${t.status} in (${inList(userStatuses)})`),
  ],
);

// Who created and last changed a row. Spread into entity tables that users edit.
export const actorColumns = () => ({
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
});
