import { sql } from 'drizzle-orm';
import { bigint, check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id } from '../db/columns';
import { users } from '../auth/table';

export const auditActorTypes = ['user', 'system', 'job'] as const;

// Append-only. Written in the same transaction as the change it describes (adr/0011).
export const auditLog = pgTable(
  'audit_log',
  {
    ...id(),
    // Insertion order. Timestamps can tie (same millisecond, or the same transaction),
    // so lists order by (at, seq) for a stable, truthful sequence.
    seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    metadata: jsonb('metadata'),
  },
  (t) => [
    check('audit_actor_type_check', sql`${t.actorType} in ('user', 'system', 'job')`),
    index('audit_entity_idx').on(t.entityType, t.entityId, t.at, t.seq),
    index('audit_actor_idx').on(t.actorId, t.at, t.seq),
    index('audit_at_idx').on(t.at, t.seq),
  ],
);
