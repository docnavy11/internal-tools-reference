import type { DbOrTx } from '../db/client';
import { auditLog } from './table';

// Who is performing a change. Requests build a user actor from the session; jobs and
// scripts use job/system actors. Passed into services, never reconstructed inside them.
export type Actor =
  | { type: 'user'; userId: string; requestId?: string; ip?: string }
  | { type: 'system'; requestId?: string }
  | { type: 'job'; jobId: string; jobName: string };

export interface AuditEntry {
  action: string; // e.g. 'users.invite'
  entityType: string; // e.g. 'user'
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

// Call inside the transaction that performs the change so both commit or neither does.
export async function recordAudit(db: DbOrTx, actor: Actor, entry: AuditEntry): Promise<void> {
  const metadata: Record<string, unknown> = { ...entry.metadata };
  if (actor.type === 'user') {
    if (actor.requestId) metadata.requestId = actor.requestId;
    if (actor.ip) metadata.ip = actor.ip;
  } else if (actor.type === 'job') {
    metadata.jobId = actor.jobId;
    metadata.jobName = actor.jobName;
  } else if (actor.requestId) {
    metadata.requestId = actor.requestId;
  }
  await db.insert(auditLog).values({
    // Application time rather than the column default: Postgres now() is the
    // transaction start, so several rows in one transaction would tie.
    at: new Date(),
    actorType: actor.type,
    actorId: actor.type === 'user' ? actor.userId : null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    metadata: Object.keys(metadata).length ? metadata : null,
  });
}
