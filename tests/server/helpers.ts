import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import type { Role } from '../../src/shared/permissions';
import { auditLog } from '../../src/server/platform/audit/table';
import { createSession } from '../../src/server/platform/auth/sessions';
import { users } from '../../src/server/platform/auth/table';
import { getDb } from '../../src/server/platform/db/client';

// Inserts a user directly and opens a session. Returns what a request needs.
export async function signInAs(email: string, role: Role = 'member') {
  const db = getDb();
  const user = (
    await db
      .insert(users)
      .values({ email, role, name: email.split('@')[0] })
      .returning()
  )[0]!;
  const token = await createSession(db, { userId: user.id });
  return { user, token, cookie: `sid=${token}` };
}

export async function auditRows(action: string, entityId?: string) {
  const rows = await getDb().select().from(auditLog).where(eq(auditLog.action, action));
  return entityId ? rows.filter((r) => r.entityId === entityId) : rows;
}

export async function expectAudited(action: string, entityId?: string) {
  const rows = await auditRows(action, entityId);
  expect(rows.length, `expected an audit row for ${action}`).toBeGreaterThan(0);
  return rows;
}

export function cookieFrom(res: Response): string {
  const header = res.headers.get('set-cookie') ?? '';
  const match = /sid=([^;]+)/.exec(header);
  if (!match) throw new Error(`no sid cookie in: ${header}`);
  return `sid=${match[1]}`;
}

export const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

// Run every due job once, in this test's transaction. Notifications are jobs, so a test
// that expects an email or a Slack message must drain the queue first.
export async function drainJobs(max = 20) {
  const { claimOne, runJob } = await import('../../src/server/platform/jobs/worker');
  const outcomes = [];
  for (let i = 0; i < max; i++) {
    const job = await claimOne();
    if (!job) break;
    outcomes.push({ name: job.name, ...(await runJob(job)) });
  }
  return outcomes;
}
