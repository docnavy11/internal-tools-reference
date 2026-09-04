import type { CurrentUser } from '../../../shared/auth';
import type { Role, UserStatus } from '../../../shared/permissions';
import type { User } from '../../../shared/features/users/schema';
import type { users } from '../auth/table';

type Row = typeof users.$inferSelect;

// API shape of a user. Also what lands in audit snapshots, so nothing internal leaks.
export function serializeUser(row: Row): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    role: row.role as Role,
    status: row.status as UserStatus,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

export function serializeCurrentUser(row: Row): CurrentUser {
  const u = serializeUser(row);
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    role: u.role,
    status: u.status,
  };
}
