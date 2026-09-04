import { and, eq, inArray, lt } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../../env';
import { auditLog } from '../audit/table';
import { getDb } from '../db/client';
import { defineJob, defineSchedule } from './define';
import { jobs } from './table';

// Housekeeping jobs the platform ships with.

export const cleanupJobs = defineJob('jobs.cleanup', z.object({}), async (_payload, ctx) => {
  const cutoff = new Date(Date.now() - env.JOBS_RETENTION_DAYS * 24 * 3600 * 1000);
  const deleted = await getDb()
    .delete(jobs)
    .where(and(inArray(jobs.status, ['succeeded', 'cancelled']), lt(jobs.finishedAt, cutoff)))
    .returning({ id: jobs.id });
  ctx.log.info({ deleted: deleted.length }, 'cleaned up finished jobs');
  return { deleted: deleted.length };
});
defineSchedule('jobs.cleanup.daily', '15 3 * * *', cleanupJobs, {});

// Audit retention is opt-in: without AUDIT_RETENTION_DAYS the log is kept forever.
export const pruneAudit = defineJob('audit.prune', z.object({}), async (_payload, ctx) => {
  if (!env.AUDIT_RETENTION_DAYS) {
    ctx.log.info('AUDIT_RETENTION_DAYS not set; nothing to prune');
    return { deleted: 0 };
  }
  const cutoff = new Date(Date.now() - env.AUDIT_RETENTION_DAYS * 24 * 3600 * 1000);
  const deleted = await getDb()
    .delete(auditLog)
    .where(lt(auditLog.at, cutoff))
    .returning({ id: auditLog.id });
  ctx.log.info({ deleted: deleted.length }, 'pruned audit rows');
  return { deleted: deleted.length };
});
if (env.AUDIT_RETENTION_DAYS) defineSchedule('audit.prune.daily', '30 3 * * *', pruneAudit, {});

// Referenced so the file's side effects are obviously intentional.
export const builtinJobs = { cleanupJobs, pruneAudit, eq };
