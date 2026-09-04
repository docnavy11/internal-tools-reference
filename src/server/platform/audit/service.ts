import { and, asc, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import type { ListParams, Page } from '../../../shared/api-types';
import type { AuditEntry, AuditFilters } from '../../../shared/audit';
import { users } from '../auth/table';
import { getDb } from '../db/client';
import { totalOf } from '../db/count';
import { offset, page } from '../http/list';
import { serializeAudit } from './serialize';
import { auditLog } from './table';
import { count } from 'drizzle-orm';

const actorColumns = { id: users.id, name: users.name, email: users.email };

export async function listAudit(params: ListParams & AuditFilters): Promise<Page<AuditEntry>> {
  const db = getDb();
  const conditions: SQL[] = [];
  if (params.actorId) conditions.push(eq(auditLog.actorId, params.actorId));
  if (params.action) conditions.push(eq(auditLog.action, params.action));
  if (params.entityType) conditions.push(eq(auditLog.entityType, params.entityType));
  if (params.entityId) conditions.push(eq(auditLog.entityId, params.entityId));
  if (params.from) conditions.push(gte(auditLog.at, new Date(params.from)));
  if (params.to) conditions.push(lte(auditLog.at, new Date(params.to)));
  const where = conditions.length ? and(...conditions) : undefined;
  // Newest first unless the caller sorts explicitly; seq breaks ties for stable paging.
  const direction = params.sort ? params.order : 'desc';
  const order =
    direction === 'asc'
      ? [asc(auditLog.at), asc(auditLog.seq)]
      : [desc(auditLog.at), desc(auditLog.seq)];

  const [rows, totalRows] = await Promise.all([
    db
      .select({ entry: auditLog, actor: actorColumns })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(where)
      .orderBy(...order)
      .limit(params.pageSize)
      .offset(offset(params)),
    db.select({ total: count() }).from(auditLog).where(where),
  ]);
  return page(
    rows.map((r) => serializeAudit(r.entry, r.actor)),
    totalOf(totalRows),
    params,
  );
}

// History of one record: same query, fixed entity, newest first.
export function entityHistory(
  entityType: string,
  entityId: string,
  params: ListParams,
): Promise<Page<AuditEntry>> {
  return listAudit({ ...params, entityType, entityId });
}

export async function auditMeta(): Promise<{ actions: string[]; entityTypes: string[] }> {
  const db = getDb();
  const [actions, entityTypes] = await Promise.all([
    db.selectDistinct({ v: auditLog.action }).from(auditLog).orderBy(auditLog.action),
    db.selectDistinct({ v: auditLog.entityType }).from(auditLog).orderBy(auditLog.entityType),
  ]);
  return { actions: actions.map((r) => r.v), entityTypes: entityTypes.map((r) => r.v) };
}

// Kept for feature services that want to assert on their own rows in tests.
export const auditCountSql = sql`select count(*) from ${auditLog}`;
