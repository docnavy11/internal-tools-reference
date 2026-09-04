import { Hono } from 'hono';
import { z } from 'zod';
import { auditFilters, auditSortColumns } from '../../../shared/audit';
import { listParamsSchema } from '../../../shared/api-types';
import { requirePermission } from '../auth/middleware';
import { parseListQuery } from '../http/list';
import type { AppEnv } from '../http/types';
import { auditMeta, listAudit } from './service';

export function auditRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const read = requirePermission('audit:read');

  r.get('/audit', read, async (c) => {
    const params = parseListQuery(c.req.query(), auditFilters, auditSortColumns);
    return c.json(await listAudit(params));
  });

  r.get('/audit/meta', read, async (c) => c.json(await auditMeta()));

  return r;
}

// Query schema for /api/<plural>/:id/history: paging only.
export const historyQuery = listParamsSchema.pick({ page: true, pageSize: true }).extend({
  sort: z.undefined().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
