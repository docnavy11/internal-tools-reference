import type { AuditEntry } from '../../../shared/audit';
import type { users } from '../auth/table';
import type { auditLog } from './table';

type Row = typeof auditLog.$inferSelect;
type ActorRow = Pick<typeof users.$inferSelect, 'id' | 'name' | 'email'> | null;

export function serializeAudit(row: Row, actor: ActorRow): AuditEntry {
  return {
    id: row.id,
    at: row.at.toISOString(),
    actorType: row.actorType as AuditEntry['actorType'],
    actor: actor ? { id: actor.id, name: actor.name, email: actor.email } : null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: row.before ?? null,
    after: row.after ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}
