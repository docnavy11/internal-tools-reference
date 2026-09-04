import { Hono } from 'hono';
import { z } from 'zod';
import { settingUpdateInput } from '../../../shared/settings';
import { requirePermission } from '../auth/middleware';
import type { AppEnv } from '../http/types';
import { validate } from '../http/validate';
import { listSettings, setSetting } from './service';

const keyParam = z.object({ key: z.string().min(1).max(100) });

export function settingsRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const manage = requirePermission('settings:manage');
  r.get('/settings', manage, async (c) => c.json(await listSettings()));
  r.patch(
    '/settings/:key',
    manage,
    validate('param', keyParam),
    validate('json', settingUpdateInput),
    async (c) =>
      c.json(await setSetting(c.get('actor'), c.req.valid('param').key, c.req.valid('json').value)),
  );
  return r;
}
