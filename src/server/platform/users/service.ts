import { and, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { ListParams, Page } from '../../../shared/api-types';
import type {
  InviteUserInput,
  UpdateUserInput,
  User,
  UserFilters,
  UserOption,
} from '../../../shared/features/users/schema';
import { recordAudit, type Actor } from '../audit/record';
import { deleteUserSessions } from '../auth/sessions';
import { users } from '../auth/table';
import { getDb, withTransaction } from '../db/client';
import { AppError, notFound } from '../http/errors';
import { offset, orderBy, page } from '../http/list';
import { serializeUser } from './serialize';
import { totalOf } from '../db/count';

const sortColumns = {
  email: users.email,
  name: users.name,
  role: users.role,
  status: users.status,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

export async function listUsers(params: ListParams & UserFilters): Promise<Page<User>> {
  const db = getDb();
  const conditions: SQL[] = [];
  if (params.q) {
    const term = `%${params.q.replace(/[%_\\]/g, '\\$&')}%`;
    conditions.push(or(ilike(users.email, term), ilike(users.name, term))!);
  }
  if (params.role) conditions.push(eq(users.role, params.role));
  if (params.status) conditions.push(eq(users.status, params.status));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(users)
      .where(where)
      .orderBy(orderBy(params, sortColumns, users.createdAt))
      .limit(params.pageSize)
      .offset(offset(params)),
    db.select({ total: count() }).from(users).where(where),
  ]);
  return page(rows.map(serializeUser), totalOf(totalRows), params);
}

export async function listUserOptions(): Promise<UserOption[]> {
  return getDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.status, 'active'))
    .orderBy(users.name, users.email);
}

export async function getUser(id: string): Promise<User> {
  const row = (await getDb().select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!row) throw notFound('User');
  return serializeUser(row);
}

export async function inviteUser(actor: Actor, input: InviteUserInput): Promise<User> {
  const email = input.email.trim().toLowerCase();
  return withTransaction(async (tx) => {
    const existing = (
      await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    )[0];
    if (existing)
      throw new AppError('already_exists', 409, 'A user with this email already exists');
    const created = (
      await tx
        .insert(users)
        .values({ email, role: input.role, invitedBy: actor.type === 'user' ? actor.userId : null })
        .returning()
    )[0]!;
    const after = serializeUser(created);
    await recordAudit(tx, actor, {
      action: 'users.invite',
      entityType: 'user',
      entityId: created.id,
      after,
    });
    return after;
  });
}

export async function updateUser(actor: Actor, id: string, input: UpdateUserInput): Promise<User> {
  return withTransaction(async (tx) => {
    const current = (await tx.select().from(users).where(eq(users.id, id)).limit(1))[0];
    if (!current) throw notFound('User');
    const before = serializeUser(current);

    const isSelf = actor.type === 'user' && actor.userId === id;
    if (isSelf) throw new AppError('self_change', 400, 'You cannot change your own role or status');

    const nextRole = input.role ?? current.role;
    const nextStatus = input.status ?? current.status;
    const losesAdmin =
      current.role === 'admin' &&
      current.status === 'active' &&
      (nextRole !== 'admin' || nextStatus !== 'active');
    if (losesAdmin) {
      // Lock every active admin row first so two concurrent demotions cannot both see
      // "one other admin remains" and leave the tool with none.
      const admins = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'admin'), eq(users.status, 'active')))
        .for('update');
      const others = admins.filter((a) => a.id !== id).length;
      if (others === 0)
        throw new AppError('last_admin', 400, 'There must be at least one active admin');
    }

    const updated = (
      await tx
        .update(users)
        .set({ role: nextRole, status: nextStatus, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning()
    )[0]!;
    const after = serializeUser(updated);
    await recordAudit(tx, actor, {
      action: 'users.update',
      entityType: 'user',
      entityId: id,
      before,
      after,
    });

    if (nextStatus === 'disabled' && current.status !== 'disabled') {
      const revoked = await deleteUserSessions(tx, id);
      await recordAudit(tx, actor, {
        action: 'users.revoke_sessions',
        entityType: 'user',
        entityId: id,
        metadata: { revoked },
      });
    }
    return after;
  });
}

export async function revokeUserSessions(actor: Actor, id: string): Promise<void> {
  await withTransaction(async (tx) => {
    const exists = (
      await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
    )[0];
    if (!exists) throw notFound('User');
    const revoked = await deleteUserSessions(tx, id);
    await recordAudit(tx, actor, {
      action: 'users.revoke_sessions',
      entityType: 'user',
      entityId: id,
      metadata: { revoked },
    });
  });
}
