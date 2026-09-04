import { describe, expect, it } from 'vitest';
import { users } from '../../src/server/platform/auth/table';
import { getDb, withTransaction } from '../../src/server/platform/db/client';

async function countUsers(): Promise<number> {
  return (await getDb().select().from(users)).length;
}

describe('database test isolation', () => {
  it('starts empty and can insert through the shared transaction', async () => {
    expect(await countUsers()).toBe(0);
    await getDb().insert(users).values({ email: 'a@example.com', role: 'admin' });
    expect(await countUsers()).toBe(1);
  });

  it('does not see rows from the previous test', async () => {
    expect(await countUsers()).toBe(0);
  });

  it('withTransaction nests as a savepoint and rolls back on error', async () => {
    await expect(
      withTransaction(async (tx) => {
        await tx.insert(users).values({ email: 'b@example.com' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await countUsers()).toBe(0);
  });

  it('enforces the role check constraint', async () => {
    await expect(
      getDb().insert(users).values({ email: 'c@example.com', role: 'god' }),
    ).rejects.toThrow();
  });
});
