import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../../env';
import { auditLog } from '../audit/table';
import { magicLinkTokens, oidcStates, sessions } from '../auth/table';
import { or } from 'drizzle-orm';
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

// Expired sessions, consumed or expired magic links, abandoned OIDC states.
export const cleanupAuth = defineJob('auth.cleanup', z.object({}), async (_payload, ctx) => {
  const db = getDb();
  const now = new Date();
  const s = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });
  const m = await db
    .delete(magicLinkTokens)
    .where(or(lt(magicLinkTokens.expiresAt, now), isNotNullUsed())!)
    .returning({ id: magicLinkTokens.id });
  const o = await db
    .delete(oidcStates)
    .where(lt(oidcStates.expiresAt, now))
    .returning({ state: oidcStates.state });
  const result = { sessions: s.length, magicLinks: m.length, oidcStates: o.length };
  ctx.log.info(result, 'cleaned up auth tables');
  return result;
});
defineSchedule('auth.cleanup.hourly', '20 * * * *', cleanupAuth, {});
function isNotNullUsed() {
  return isNotNull(magicLinkTokens.usedAt);
}

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
