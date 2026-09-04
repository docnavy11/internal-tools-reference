// Runs once before the whole suite: migrate the test database.
export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  try {
    process.loadEnvFile('.env');
  } catch {
    // CI sets variables directly
  }
  if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is required to run the test suite (see .env.example)');
  }
  const { runMigrations } = await import('../../src/server/platform/db/migrate');
  const { closeDatabase, db } = await import('../../src/server/platform/db/client');
  const { sql } = await import('drizzle-orm');
  await runMigrations();
  // The e2e suite also uses this database and leaves rows behind. Tests assume empty
  // tables, so start clean. Only the test database is ever reachable from here.
  await db.execute(sql`
    do $$ declare t text;
    begin
      for t in select tablename from pg_tables where schemaname = 'public' loop
        execute format('truncate table %I cascade', t);
      end loop;
    end $$;
  `);
  await closeDatabase();
}
