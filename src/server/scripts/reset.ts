import { createInterface } from 'node:readline/promises';
import { sql } from 'drizzle-orm';
import { env } from '../env';
import { closeDatabase, db } from '../platform/db/client';
import { runMigrations } from '../platform/db/migrate';
import { seed } from '../platform/db/seed';
import { logger } from '../platform/http/logger';

// Development only: drop every table, migrate from scratch, seed. Asks first unless
// --yes is passed. Refuses in production. Never call this from application code.
async function reset(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('db:reset refuses to run with NODE_ENV=production');
  }
  if (!process.argv.includes('--yes')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `Drop ALL data in ${env.DATABASE_URL}? Type "reset" to continue: `,
    );
    rl.close();
    if (answer.trim() !== 'reset') {
      logger.info('aborted');
      return;
    }
  }
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`drop schema public cascade`);
  await db.execute(sql`create schema public`);
  logger.warn('database schema dropped');
  await runMigrations();
  await seed();
}

reset()
  .then(() => closeDatabase())
  .catch((err) => {
    logger.error({ err }, 'reset failed');
    process.exit(1);
  });
