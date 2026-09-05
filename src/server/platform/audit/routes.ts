import { Hono } from 'hono';
import { z } from 'zod';
import { auditFilters, auditSortColumns } from '../../../shared/audit';
import { listParamsSchema } from '../../../shared/api-types';
import { requirePermission } from '../auth/middleware';
import type { AuditEntry } from '../../../shared/audit';
import { csvFilename, csvResponse, iteratePages } from '../csv/stream';
import { parseListQuery } from '../http/list';
import type { AppEnv } from '../http/types';
import { auditMeta, listAudit } from './service';

export function auditRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const read = requirePermission('audit:read');

  r.get('/audit', read, async (c) => {
    const params = parseListQuery(c.req.query(), auditFilters, auditSortColumns);
    if (c.req.query('format') === 'csv') {
      const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));
      return csvResponse(
        c,
        csvFilename('audit-log'),
        [
          { header: 'id', value: (e: AuditEntry) => e.id },
          { header: 'at', value: (e: AuditEntry) => e.at },
          { header: 'actorType', value: (e: AuditEntry) => e.actorType },
          { header: 'actor', value: (e: AuditEntry) => e.actor?.email ?? null },
          { header: 'action', value: (e: AuditEntry) => e.action },
          { header: 'entityType', value: (e: AuditEntry) => e.entityType },
          { header: 'entityId', value: (e: AuditEntry) => e.entityId },
          { header: 'before', value: (e: AuditEntry) => json(e.before) },
          { header: 'after', value: (e: AuditEntry) => json(e.after) },
          { header: 'metadata', value: (e: AuditEntry) => json(e.metadata) },
        ],
        iteratePages((page, pageSize) => listAudit({ ...params, page, pageSize })),
      );
    }
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
