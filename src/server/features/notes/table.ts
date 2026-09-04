import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { customers } from '../customers/table';
import { actorColumns } from '../../platform/auth/table';
import { id, softDelete, timestamps } from '../../platform/db/columns';
import { files } from '../../platform/storage/table';

// Child of customers. Deleting a customer for good (purge job) cascades to its notes.
export const notes = pgTable(
  'notes',
  {
    ...id(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    attachmentId: uuid('attachment_id').references(() => files.id, { onDelete: 'set null' }),
    ...actorColumns(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('notes_customer_idx').on(t.customerId, t.createdAt),
    index('notes_attachment_idx').on(t.attachmentId),
    index('notes_created_by_idx').on(t.createdBy),
    index('notes_updated_by_idx').on(t.updatedBy),
  ],
);
