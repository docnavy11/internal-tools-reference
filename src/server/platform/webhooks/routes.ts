import { Hono } from 'hono';
import { z } from 'zod';
import { webhookFilters, webhookSortColumns } from '../../../shared/webhooks';
import { requirePermission } from '../auth/middleware';
import type { WebhookEvent } from '../../../shared/webhooks';
import { csvFilename, csvResponse, iteratePages } from '../csv/stream';
import { parseListQuery } from '../http/list';
import type { AppEnv } from '../http/types';
import { validate } from '../http/validate';
import { listWebhookVendors } from './define';
import { getWebhookEvent, listWebhookEvents, replayWebhookEvent } from './service';

const idParam = z.object({ id: z.string().uuid() });

export function webhookAdminRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const manage = requirePermission('jobs:manage');
  r.get('/webhooks', manage, async (c) => {
    const params = parseListQuery(c.req.query(), webhookFilters, webhookSortColumns);
    if (c.req.query('format') === 'csv') {
      return csvResponse(
        c,
        csvFilename('webhooks'),
        [
          { header: 'id', value: (e: WebhookEvent) => e.id },
          { header: 'vendor', value: (e: WebhookEvent) => e.vendor },
          { header: 'externalId', value: (e: WebhookEvent) => e.externalId },
          { header: 'eventType', value: (e: WebhookEvent) => e.eventType },
          { header: 'status', value: (e: WebhookEvent) => e.status },
          { header: 'receivedAt', value: (e: WebhookEvent) => e.receivedAt },
          { header: 'processedAt', value: (e: WebhookEvent) => e.processedAt },
          { header: 'attempts', value: (e: WebhookEvent) => e.attempts },
          { header: 'error', value: (e: WebhookEvent) => e.error },
        ],
        iteratePages((page, pageSize) => listWebhookEvents({ ...params, page, pageSize })),
      );
    }
    return c.json(await listWebhookEvents(params));
  });
  r.get('/webhooks/vendors', manage, (c) => c.json(listWebhookVendors()));
  r.get('/webhooks/:id', manage, validate('param', idParam), async (c) =>
    c.json(await getWebhookEvent(c.req.valid('param').id)),
  );
  r.post('/webhooks/:id/replay', manage, validate('param', idParam), async (c) =>
    c.json(await replayWebhookEvent(c.get('actor'), c.req.valid('param').id)),
  );
  return r;
}
