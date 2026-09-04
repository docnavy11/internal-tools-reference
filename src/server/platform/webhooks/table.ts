import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { id } from '../db/columns';

// Inbox for inbound webhooks: raw payload kept for replay, unique per vendor + external id
// so duplicate deliveries are acknowledged without doing the work twice.
export const webhookEvents = pgTable(
  'webhook_events',
  {
    ...id(),
    vendor: text('vendor').notNull(),
    externalId: text('external_id').notNull(),
    eventType: text('event_type'),
    payload: jsonb('payload').notNull(),
    headers: jsonb('headers').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => [
    uniqueIndex('webhook_events_vendor_external_idx').on(t.vendor, t.externalId),
    index('webhook_events_received_idx').on(t.receivedAt),
    index('webhook_events_vendor_type_idx').on(t.vendor, t.eventType),
  ],
);
