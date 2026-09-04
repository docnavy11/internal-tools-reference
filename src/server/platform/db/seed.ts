import { env } from '../../env';
import { users } from '../auth/table';
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
}
