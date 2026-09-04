import { Hono } from 'hono';
import { z } from 'zod';
import { noteInput } from '../../../shared/features/notes/schema';
import type { Role } from '../../../shared/permissions';
import { requirePermission } from '../../platform/auth/middleware';
import { AppError } from '../../platform/http/errors';
import type { AppEnv } from '../../platform/http/types';
import { uploadBodyLimit } from '../../platform/http/body-limit';
import { validate } from '../../platform/http/validate';
import { createNote, deleteNote, listNotes, updateNote } from './service';

const customerParam = z.object({ customerId: z.string().uuid() });
const idParam = z.object({ id: z.string().uuid() });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export function noteRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const read = requirePermission('notes:read');
  const write = requirePermission('notes:write');

  r.get(
    '/customers/:customerId/notes',
    read,
    validate('param', customerParam),
    validate('query', pageQuery),
    async (c) => {
      const { page, pageSize } = c.req.valid('query');
      return c.json(
        await listNotes(c.req.valid('param').customerId, { page, pageSize, order: 'desc' }),
      );
    },
  );

  // multipart/form-data: body (text) and an optional file.
  r.post(
    '/customers/:customerId/notes',
    write,
    uploadBodyLimit,
    validate('param', customerParam),
    async (c) => {
      const form = await c.req.parseBody();
      const parsed = noteInput.safeParse({
        body: typeof form['body'] === 'string' ? form['body'] : '',
      });
      if (!parsed.success)
        throw new AppError('validation_error', 400, 'Invalid request', parsed.error.flatten());
      const file = form['file'];
      const attachment =
        file instanceof File
          ? { filename: file.name, bytes: Buffer.from(await file.arrayBuffer()) }
          : null;
      return c.json(
        await createNote(c.get('actor'), c.req.valid('param').customerId, {
          ...parsed.data,
          attachment,
        }),
        201,
      );
    },
  );

  r.patch(
    '/notes/:id',
    write,
    validate('param', idParam),
    validate('json', noteInput),
    async (c) => {
      return c.json(
        await updateNote(
          c.get('actor'),
          c.get('session')!.user.role as Role,
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
      );
    },
  );

  r.delete('/notes/:id', write, validate('param', idParam), async (c) => {
    await deleteNote(c.get('actor'), c.get('session')!.user.role as Role, c.req.valid('param').id);
    return c.body(null, 204);
  });

  return r;
}
