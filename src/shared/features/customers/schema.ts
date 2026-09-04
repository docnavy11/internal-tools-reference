import { z } from 'zod';
import { csvArray } from '../../query';

// Golden example entity. See docs/ARCHITECTURE.md section 12 and docs/recipes/add-entity.md.
// Delete or rename this feature when starting a real tool.

export const customerStatuses = ['lead', 'active', 'churned'] as const;
export const customerStatus = z.enum(customerStatuses);
export type CustomerStatus = z.infer<typeof customerStatus>;

export const customerPlans = ['free', 'pro', 'enterprise'] as const;
export const customerPlan = z.enum(customerPlans);
export type CustomerPlan = z.infer<typeof customerPlan>;

// Minimal shape of a user shown next to a record (owner, actor). Any signed-in user
// may see this much about colleagues.
export const userRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string().email(),
});
export type UserRef = z.infer<typeof userRefSchema>;

// Full record as returned by the API.
export const customerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email().nullable(),
  status: customerStatus,
  plan: customerPlan,
  tags: z.array(z.string()),
  owner: userRefSchema.nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
});
export type Customer = z.infer<typeof customerSchema>;

// Create body. PATCH accepts a partial of this.
export const customerInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().trim().email().max(320).nullable(),
  status: customerStatus.default('lead'),
  plan: customerPlan.default('free'),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  ownerId: z.string().uuid().nullable().default(null),
  notes: z.string().max(5000).nullable().default(null),
});
export type CustomerInput = z.infer<typeof customerInput>;
export const customerPatch = customerInput.partial();
export type CustomerPatch = z.infer<typeof customerPatch>;

// GET /api/customers query parameters, on top of page/pageSize/sort/order.
export const customerFilters = z.object({
  q: z.string().max(200).optional(),
  status: csvArray(customerStatus),
  plan: csvArray(customerPlan),
  ownerId: z.string().uuid().optional(),
  tag: z.string().max(40).optional(),
  includeDeleted: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type CustomerFilters = z.infer<typeof customerFilters>;

export const customerSortColumns = [
  'name',
  'email',
  'status',
  'plan',
  'createdAt',
  'updatedAt',
] as const;

// POST /api/customers/bulk
export const customerBulkInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set_status'),
    ids: z.array(z.string().uuid()).min(1).max(200),
    status: customerStatus,
  }),
  z.object({
    action: z.literal('set_plan'),
    ids: z.array(z.string().uuid()).min(1).max(200),
    plan: customerPlan,
  }),
  z.object({ action: z.literal('delete'), ids: z.array(z.string().uuid()).min(1).max(200) }),
]);
export type CustomerBulkInput = z.infer<typeof customerBulkInput>;

export interface BulkResult {
  affected: number;
}
