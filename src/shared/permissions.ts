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
] as const;
export type Permission = (typeof permissions)[number];

export const rolePermissions: Record<Role, readonly Permission[]> = {
  admin: permissions,
  member: ['customers:read', 'customers:write'],
  viewer: ['customers:read'],
};

export const userStatuses = ['active', 'disabled'] as const;
export type UserStatus = (typeof userStatuses)[number];
