import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { roles, userStatuses } from '../../../shared/permissions';
import { enumCheck, id, timestamps } from '../db/columns';

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
    check('users_role_check', enumCheck(t.role, roles)),
    check('users_status_check', enumCheck(t.status, userStatuses)),
    index('users_invited_by_idx').on(t.invitedBy),
  ],
);

// Who created and last changed a row. Spread into entity tables that users edit.
export const actorColumns = () => ({
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
});

// Server-side sessions. The cookie holds a random token; only its SHA-256 is stored.
export const sessions = pgTable(
  'sessions',
  {
    ...id(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

// Single-use sign-in links. Same hashing rule as sessions.
export const magicLinkTokens = pgTable('magic_link_tokens', {
  ...id(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  redirectTo: text('redirect_to'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// In-flight OIDC authorization requests, keyed by the state parameter.
export const oidcStates = pgTable('oidc_states', {
  state: text('state').primaryKey(),
  nonce: text('nonce').notNull(),
  codeVerifier: text('code_verifier').notNull(),
  provider: text('provider').notNull(),
  redirectTo: text('redirect_to'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
