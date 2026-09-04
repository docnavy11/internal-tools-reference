import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { jobStatuses } from '../../../shared/jobs';
import { id } from '../db/columns';

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

// Background work. Claimed with FOR UPDATE SKIP LOCKED (adr/0006).
export const jobs = pgTable(
  'jobs',
  {
    ...id(),
    name: text('name').notNull(),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text('status').notNull().default('pending'),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    result: jsonb('result'),
    dedupeKey: text('dedupe_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    check('jobs_status_check', sql`${t.status} in (${inList(jobStatuses)})`),
    index('jobs_claim_idx').on(t.status, t.runAt),
    index('jobs_name_created_idx').on(t.name, t.createdAt),
    index('jobs_finished_idx').on(t.status, t.finishedAt),
    // One live job per dedupe key. Finished jobs release the key.
    uniqueIndex('jobs_dedupe_idx')
      .on(t.dedupeKey)
      .where(sql`${t.status} in ('pending', 'running')`),
  ],
);

// Cron schedules defined in code and mirrored here so enabled/last/next survive restarts.
export const schedules = pgTable('schedules', {
  name: text('name').primaryKey(),
  cron: text('cron').notNull(),
  jobName: text('job_name').notNull(),
  payload: jsonb('payload')
    .notNull()
    .default(sql`'{}'::jsonb`),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});
