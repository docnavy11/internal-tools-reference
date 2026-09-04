import { afterAll, afterEach, beforeEach } from 'vitest';
import {
  closeDatabase,
  db,
  setTestTransaction,
  type Tx,
} from '../../src/server/platform/db/client';

// Each test runs inside a transaction that is rolled back afterwards, so tests never
// see each other's rows and the database needs no cleanup. Code under test joins the
// transaction through getDb() / withTransaction(); nested transactions are savepoints.

class Rollback extends Error {}

let finish: (() => void) | undefined;
let done: Promise<unknown> | undefined;

beforeEach(async () => {
  let resolveTx!: (tx: Tx) => void;
  const txReady = new Promise<Tx>((r) => (resolveTx = r));
  const finished = new Promise<void>((r) => (finish = r));
  done = db
    .transaction(async (tx) => {
      resolveTx(tx);
      await finished;
      throw new Rollback();
    })
    .catch((err) => {
      if (!(err instanceof Rollback)) throw err;
    });
  setTestTransaction(await txReady);
});

afterEach(async () => {
  setTestTransaction(null);
  finish?.();
  await done;
});

afterAll(async () => {
  await closeDatabase();
});
