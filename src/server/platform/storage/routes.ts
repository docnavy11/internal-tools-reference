import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { z } from 'zod';
import { entityPermissions, type Role } from '../../../shared/permissions';
import { hasPermission, requireAuth } from '../auth/middleware';
import { forbidden } from '../http/errors';
import type { AppEnv } from '../http/types';
import { validate } from '../http/validate';
import { getFileRecord, openFile } from './service';
import { isInlineType } from './sniff';

const idParam = z.object({ id: z.string().uuid() });

// Who may read a file: the read permission of the entity it belongs to, or files:manage.
export function canReadFile(role: Role, entityType: string | null): boolean {
  if (hasPermission(role, 'files:manage')) return true;
  const perms = entityType ? entityPermissions[entityType] : undefined;
  return !!perms && hasPermission(role, perms.read);
}

export function canWriteFile(role: Role, entityType: string | null): boolean {
  if (hasPermission(role, 'files:manage')) return true;
  const perms = entityType ? entityPermissions[entityType] : undefined;
  return !!perms && hasPermission(role, perms.write);
}

export function fileRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  // Download. Served through the app so the same session and permissions apply.
  r.get('/files/:id', requireAuth(), validate('param', idParam), async (c) => {
    const { record, row } = await getFileRecord(c.req.valid('param').id);
    if (!canReadFile(c.get('session')!.user.role as Role, row.entityType)) throw forbidden();
    const disposition = isInlineType(record.contentType) ? 'inline' : 'attachment';
    const safeName = record.filename.replace(/["\r\n]/g, '_');
    c.header('content-type', record.contentType);
    c.header('content-length', String(record.sizeBytes));
    c.header(
      'content-disposition',
      `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
    );
    c.header('x-content-type-options', 'nosniff');
    c.header('cache-control', 'private, max-age=0');
    const body = await openFile(row);
    return stream(c, async (out) => {
      for await (const chunk of body as Readable) await out.write(chunk as Uint8Array);
    });
  });

  return r;
}
