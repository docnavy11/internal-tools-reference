import { describe, expect, it } from 'vitest';
import { customerSchema } from '../../src/shared/features/customers/schema';
import { userSchema } from '../../src/shared/features/users/schema';
import { listCustomers } from '../../src/server/features/customers/service';
import { seed } from '../../src/server/platform/db/seed';
import { listUsers } from '../../src/server/platform/users/service';

// Drizzle tables and Zod schemas are written by hand (adr/0008). This catches drift:
// every seeded row, serialized the way the API serializes it, must satisfy the schema.
describe('seed rows satisfy the shared schemas', () => {
  it('customers and users', async () => {
    await seed();
    const customers = await listCustomers({
      page: 1,
      pageSize: 50,
      order: 'asc',
      includeDeleted: false,
    });
    expect(customers.total).toBeGreaterThan(0);
    for (const c of customers.items) expect(() => customerSchema.parse(c)).not.toThrow();
    const users = await listUsers({ page: 1, pageSize: 50, order: 'asc' });
    for (const u of users.items) expect(() => userSchema.parse(u)).not.toThrow();
  });
});
