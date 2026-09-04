import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './client';
import { logger } from '../http/logger';

export async function runMigrations(): Promise<void> {
  logger.info('running migrations');
  await migrate(db, { migrationsFolder: 'drizzle' });
  logger.info('migrations complete');
}
