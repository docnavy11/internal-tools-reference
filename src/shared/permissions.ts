// Roles and permission strings. Features add their permission strings here; this is
// the only file outside a feature's own folders that a new feature edits.

export const roles = ['admin', 'member', 'viewer'] as const;
export type Role = (typeof roles)[number];

export const permissions = [
  'users:manage',
  'audit:read',
  'jobs:manage',
  'settings:manage',
  'files:manage',
  'customers:read',
  'customers:write',
  'customers:delete',
  'notes:read',
  'notes:write',
] as const;
export type Permission = (typeof permissions)[number];

export const rolePermissions: Record<Role, readonly Permission[]> = {
  admin: permissions,
  member: ['customers:read', 'customers:write', 'notes:read', 'notes:write'],
  viewer: ['customers:read', 'notes:read'],
};

export const userStatuses = ['active', 'disabled'] as const;
export type UserStatus = (typeof userStatuses)[number];

// Permissions that guard records of a given entity type, used by cross-cutting code such
// as file downloads and history endpoints. A new entity adds one line.
export const entityPermissions: Record<string, { read: Permission; write: Permission }> = {
  customer: { read: 'customers:read', write: 'customers:write' },
  note: { read: 'notes:read', write: 'notes:write' },
  user: { read: 'users:manage', write: 'users:manage' },
};
