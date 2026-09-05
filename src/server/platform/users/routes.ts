import { Hono } from 'hono';
import { z } from 'zod';
import type { User } from '../../../shared/features/users/schema';
import {
  inviteUserInput,
  updateUserInput,
  userFilters,
  userSortColumns,
} from '../../../shared/features/users/schema';
import { requireAuth, requirePermission } from '../auth/middleware';
import { csvFilename, csvResponse, iteratePages } from '../csv/stream';
import { parseListQuery } from '../http/list';
import { validate } from '../http/validate';
import type { AppEnv } from '../http/types';
import { inviteUser, listUserOptions, listUsers, revokeUserSessions, updateUser } from './service';

const idParam = z.object({ id: z.string().uuid() });

export function userRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const manage = requirePermission('users:manage');

  // For owner and actor pickers: any signed-in user may see colleagues' names.
  r.get('/users/options', requireAuth(), async (c) => c.json(await listUserOptions()));

  r.get('/users', manage, async (c) => {
    const params = parseListQuery(c.req.query(), userFilters, userSortColumns);
    if (c.req.query('format') === 'csv') {
      return csvResponse(
        c,
        csvFilename('users'),
        [
          { header: 'id', value: (u: User) => u.id },
          { header: 'email', value: (u: User) => u.email },
          { header: 'name', value: (u: User) => u.name },
          { header: 'role', value: (u: User) => u.role },
          { header: 'status', value: (u: User) => u.status },
          { header: 'lastLoginAt', value: (u: User) => u.lastLoginAt },
          { header: 'createdAt', value: (u: User) => u.createdAt },
        ],
        iteratePages((page, pageSize) => listUsers({ ...params, page, pageSize })),
      );
    }
    return c.json(await listUsers(params));
  });

  r.post('/users', manage, validate('json', inviteUserInput), async (c) => {
    const user = await inviteUser(c.get('actor'), c.req.valid('json'));
    return c.json(user, 201);
  });

  r.patch(
    '/users/:id',
    manage,
    validate('param', idParam),
    validate('json', updateUserInput),
    async (c) => {
      const user = await updateUser(c.get('actor'), c.req.valid('param').id, c.req.valid('json'));
      return c.json(user);
    },
  );

  r.post('/users/:id/revoke-sessions', manage, validate('param', idParam), async (c) => {
    await revokeUserSessions(c.get('actor'), c.req.valid('param').id);
    return c.body(null, 204);
  });

  return r;
}
