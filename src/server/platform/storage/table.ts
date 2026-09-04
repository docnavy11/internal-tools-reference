import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/table';
import { id, softDelete } from '../db/columns';

// File metadata. Bytes live behind the storage adapter under storage_key.
export const files = pgTable(
  'files',
  {
    ...id(),
    storageKey: text('storage_key').notNull().unique(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    ...softDelete(),
  },
  (t) => [
    index('files_entity_idx').on(t.entityType, t.entityId),
    index('files_uploaded_by_idx').on(t.uploadedBy),
    index('files_deleted_idx').on(t.deletedAt),
  ],
);
