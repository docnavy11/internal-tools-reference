import type {
  Customer,
  CustomerPlan,
  CustomerStatus,
} from '../../../shared/features/customers/schema';
import type { users } from '../../platform/auth/table';
import type { customers } from './table';

type Row = typeof customers.$inferSelect;
type OwnerRow = Pick<typeof users.$inferSelect, 'id' | 'name' | 'email'> | null;

// API shape. Also what lands in audit snapshots, so nothing internal leaks.
export function serializeCustomer(row: Row, owner: OwnerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status as CustomerStatus,
    plan: row.plan as CustomerPlan,
    tags: row.tags,
    owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
