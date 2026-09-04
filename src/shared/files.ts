import { z } from 'zod';
import { userRefSchema } from './user-ref';

// Files API. Bytes live behind the storage adapter; this is the metadata row.
// See docs/blocks/09-storage.md.

export const fileSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  sha256: z.string(),
  uploadedBy: userRefSchema.nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  // Download path on this app: GET /api/files/:id. Inline for images and PDF, else attachment.
  url: z.string(),
});
export type FileRecord = z.infer<typeof fileSchema>;

// Which permission guards files attached to which entity type. Upload and delete need
// the write permission, download the read permission. Files with no entity need files:manage.
export const fileEntityTypes = ['customer', 'note'] as const;
export type FileEntityType = (typeof fileEntityTypes)[number];
