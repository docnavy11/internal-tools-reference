import { drizzle, type NodePgDatabase, type NodePgTransaction } from 'drizzle-orm/node-postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import pg from 'pg';
import { env } from '../../env';
import * as schema from './schema';

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX });

export const db = drizzle(pool, { schema });

export type Db = NodePgDatabase<typeof schema>;
export type Tx = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;
export type DbOrTx = Db | Tx;

// Tests wrap each test in a transaction that is rolled back afterwards. They install it
// here so every getDb() and withTransaction() call in the code under test joins it
// (nested transactions become savepoints). Never set in application code.
let testTransaction: Tx | null = null;

export function setTestTransaction(tx: Tx | null): void {
  testTransaction = tx;
}

export function getDb(): DbOrTx {
  return testTransaction ?? db;
}

export function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(fn);
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  }
}

let closing: Promise<void> | null = null;
export function closeDatabase(): Promise<void> {
  closing ??= pool.end();
  return closing;
}
