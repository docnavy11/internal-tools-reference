import { z } from 'zod';
import { userRefSchema } from './features/customers/schema';

// GET /api/audit (permission audit:read) and GET /api/<plural>/:id/history.

export const auditActorTypes = ['user', 'system', 'job'] as const;

export const auditEntrySchema = z.object({
  id: z.string().uuid(),
  at: z.string().datetime(),
  actorType: z.enum(auditActorTypes),
  actor: userRefSchema.nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().uuid().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  metadata: z.record(z.unknown()).nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditFilters = z.object({
  actorId: z.string().uuid().optional(),
  action: z.string().max(100).optional(),
  entityType: z.string().max(100).optional(),
  entityId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type AuditFilters = z.infer<typeof auditFilters>;

export const auditSortColumns = ['at'] as const;
