import { env } from '../../env';
import { eq } from 'drizzle-orm';
import { users } from '../auth/table';
import { customers } from '../../features/customers/table';
import { getDb } from './client';
import { logger } from '../http/logger';

export const DEV_ADMIN_EMAIL = 'admin@local.test';

// Idempotent development seed. Refuses to run in production.
export async function seed(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('seed refuses to run with NODE_ENV=production');
  }
  const db = getDb();
  await db
    .insert(users)
    .values({ email: DEV_ADMIN_EMAIL, name: 'Local Admin', role: 'admin' })
    .onConflictDoNothing({ target: users.email });
  logger.info({ email: DEV_ADMIN_EMAIL }, 'seeded dev admin');

  // Golden example rows. Idempotent: only inserted when the table is empty.
  const admin = (
    await db.select({ id: users.id }).from(users).where(eq(users.email, DEV_ADMIN_EMAIL))
  )[0]!;
  const existing = await db.select({ id: customers.id }).from(customers).limit(1);
  if (existing.length === 0) {
    await db.insert(customers).values([
      {
        name: 'Acme Corporation',
        email: 'ops@acme.example',
        status: 'active',
        plan: 'enterprise',
        tags: ['vip', 'eu'],
        ownerId: admin.id,
        createdBy: admin.id,
      },
      {
        name: 'Globex',
        email: 'hello@globex.example',
        status: 'active',
        plan: 'pro',
        tags: ['us'],
        ownerId: admin.id,
        createdBy: admin.id,
      },
      { name: 'Initech', email: null, status: 'lead', plan: 'free', tags: [], createdBy: admin.id },
      {
        name: 'Umbrella Ltd',
        email: 'contact@umbrella.example',
        status: 'churned',
        plan: 'pro',
        tags: ['eu'],
        notes: 'Churned after the Q2 price change.',
        createdBy: admin.id,
      },
    ]);
    logger.info('seeded example customers');
  }
}
