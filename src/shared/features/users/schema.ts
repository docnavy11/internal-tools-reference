import { z } from 'zod';
import { roles, userStatuses } from '../../permissions';

// Users admin API: /api/users (permission users:manage). See docs/blocks/02-authorization.md.

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: z.enum(roles),
  status: z.enum(userStatuses),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
});
export type User = z.infer<typeof userSchema>;

// POST /api/users: invite. The person can then sign in even if their domain is not allowed.
export const inviteUserInput = z.object({
  email: z.string().email().max(320),
  role: z.enum(roles).default('member'),
});
export type InviteUserInput = z.infer<typeof inviteUserInput>;

// PATCH /api/users/:id: change role and/or status. Disabling also revokes sessions.
export const updateUserInput = z
  .object({
    role: z.enum(roles).optional(),
    status: z.enum(userStatuses).optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, { message: 'Nothing to update' });
export type UpdateUserInput = z.infer<typeof updateUserInput>;

// GET /api/users query parameters (plus page, pageSize, sort, order from the list envelope).
export const userFilters = z.object({
  q: z.string().max(200).optional(),
  role: z.enum(roles).optional(),
  status: z.enum(userStatuses).optional(),
});
export type UserFilters = z.infer<typeof userFilters>;

export const userSortColumns = [
  'email',
  'name',
  'role',
  'status',
  'lastLoginAt',
  'createdAt',
] as const;
