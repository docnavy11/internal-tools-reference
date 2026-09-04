import { Hono } from 'hono';
import { z } from 'zod';
import {
  inviteUserInput,
  updateUserInput,
  userFilters,
  userSortColumns,
} from '../../../shared/features/users/schema';
import { requirePermission } from '../auth/middleware';
import { parseListQuery } from '../http/list';
import { validate } from '../http/validate';
import type { AppEnv } from '../http/types';
import { inviteUser, listUsers, revokeUserSessions, updateUser } from './service';

const idParam = z.object({ id: z.string().uuid() });

export function userRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const manage = requirePermission('users:manage');

  r.get('/users', manage, async (c) => {
    const params = parseListQuery(c.req.query(), userFilters, userSortColumns);
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
