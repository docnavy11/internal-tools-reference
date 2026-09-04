import { and, eq, inArray } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../db/client';
import type { JobDefinition } from './define';
import { jobs } from './table';

export interface EnqueueOptions {
  // Pass the transaction of the change that causes the job so both commit together.
  tx?: DbOrTx;
  runAt?: Date;
  // At most one pending or running job with this key. A duplicate enqueue is a no-op.
  dedupeKey?: string;
  maxAttempts?: number;
}

export interface Enqueued {
  id: string;
  deduped: boolean;
}

export async function enqueue<T>(
  job: JobDefinition<T>,
  payload: T,
  options: EnqueueOptions = {},
): Promise<Enqueued> {
  const db = options.tx ?? getDb();
  const parsed = job.schema.parse(payload);
  const values = {
    name: job.name,
    payload: parsed as object,
    runAt: options.runAt ?? new Date(),
    maxAttempts: options.maxAttempts ?? job.maxAttempts,
    dedupeKey: options.dedupeKey ?? null,
  };
  if (!options.dedupeKey) {
    const inserted = (await db.insert(jobs).values(values).returning({ id: jobs.id }))[0]!;
    return { id: inserted.id, deduped: false };
  }
  // The partial unique index enforces the key; ON CONFLICT with a partial index needs
  // the predicate, which Drizzle expresses through `where` on the conflict target.
  const inserted = await db
    .insert(jobs)
    .values(values)
    .onConflictDoNothing({
      target: jobs.dedupeKey,
      where: inArray(jobs.status, ['pending', 'running']),
    })
    .returning({ id: jobs.id });
  if (inserted[0]) return { id: inserted[0].id, deduped: false };
  const existing = (
    await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(eq(jobs.dedupeKey, options.dedupeKey), inArray(jobs.status, ['pending', 'running'])),
      )
      .limit(1)
  )[0];
  return { id: existing?.id ?? '', deduped: true };
}
