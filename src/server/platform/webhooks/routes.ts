import { Hono } from 'hono';
import { z } from 'zod';
import { webhookFilters, webhookSortColumns } from '../../../shared/webhooks';
import { requirePermission } from '../auth/middleware';
import { parseListQuery } from '../http/list';
import type { AppEnv } from '../http/types';
import { validate } from '../http/validate';
import { listWebhookVendors } from './define';
import { getWebhookEvent, listWebhookEvents, replayWebhookEvent } from './service';

const idParam = z.object({ id: z.string().uuid() });

export function webhookAdminRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const manage = requirePermission('jobs:manage');
  r.get('/webhooks', manage, async (c) =>
    c.json(
      await listWebhookEvents(parseListQuery(c.req.query(), webhookFilters, webhookSortColumns)),
    ),
  );
  r.get('/webhooks/vendors', manage, (c) => c.json(listWebhookVendors()));
  r.get('/webhooks/:id', manage, validate('param', idParam), async (c) =>
    c.json(await getWebhookEvent(c.req.valid('param').id)),
  );
  r.post('/webhooks/:id/replay', manage, validate('param', idParam), async (c) =>
    c.json(await replayWebhookEvent(c.get('actor'), c.req.valid('param').id)),
  );
  return r;
}
