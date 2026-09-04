import { z } from 'zod';
import { fileSchema } from '../../files';
import { userRefSchema } from '../../user-ref';

// Child entity of customers: a note with an optional attachment. Shows the parent-child
// pattern (nested route, detail tab) and file upload. See docs/ARCHITECTURE.md section 12.

export const noteSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  body: z.string(),
  author: userRefSchema.nullable(),
  attachment: fileSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
});
export type Note = z.infer<typeof noteSchema>;

// POST /api/customers/:id/notes is multipart/form-data: field `body` (text) and an
// optional `file`. PATCH /api/notes/:id is JSON with this shape.
export const noteInput = z.object({
  body: z.string().trim().min(1, 'Write something').max(5000),
});
export type NoteInput = z.infer<typeof noteInput>;

export const noteSortColumns = ['createdAt'] as const;
