import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { migrationsDir } from '../../paths';
import { db } from './client';
import { logger } from '../http/logger';

// Serialised across processes with an advisory lock so a web and a worker replica
// both started with MIGRATE_ON_START=true cannot run the same migration twice.
const MIGRATION_LOCK = 7_461_927;

export async function runMigrations(): Promise<void> {
  logger.info('running migrations');
  await db.execute(sql`select pg_advisory_lock(${MIGRATION_LOCK})`);
  try {
    await migrate(db, { migrationsFolder: migrationsDir });
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${MIGRATION_LOCK})`);
  }
  logger.info('migrations complete');
}
