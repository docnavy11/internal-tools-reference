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
  const { closeDatabase } = await import('../../src/server/platform/db/client');
  await runMigrations();
  await closeDatabase();
}
