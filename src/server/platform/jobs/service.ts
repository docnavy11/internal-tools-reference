import { and, count, eq, inArray, type SQL } from 'drizzle-orm';
import type { ListParams, Page } from '../../../shared/api-types';
import type { Job, JobFilters, Schedule } from '../../../shared/jobs';
import { recordAudit, type Actor } from '../audit/record';
import { getDb, withTransaction } from '../db/client';
import { totalOf } from '../db/count';
import { AppError, notFound } from '../http/errors';
import { offset, orderBy, page } from '../http/list';
import { getJobDefinition } from './define';
import { enqueue } from './enqueue';
import { serializeJob, serializeSchedule } from './serialize';
import { jobs, schedules } from './table';

const sortColumns = {
  createdAt: jobs.createdAt,
  runAt: jobs.runAt,
  finishedAt: jobs.finishedAt,
  name: jobs.name,
  status: jobs.status,
  attempts: jobs.attempts,
};

export async function listJobs(params: ListParams & JobFilters): Promise<Page<Job>> {
  const db = getDb();
  const conditions: SQL[] = [];
  if (params.status) conditions.push(inArray(jobs.status, params.status));
  if (params.name) conditions.push(eq(jobs.name, params.name));
  const where = conditions.length ? and(...conditions) : undefined;
  const direction = params.sort ? params : { ...params, order: 'desc' as const };
  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(jobs)
      .where(where)
      .orderBy(orderBy(direction, sortColumns, jobs.createdAt))
      .limit(params.pageSize)
      .offset(offset(params)),
    db.select({ total: count() }).from(jobs).where(where),
  ]);
  return page(rows.map(serializeJob), totalOf(totalRows), params);
}

export async function getJob(id: string): Promise<Job> {
  const row = (await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1))[0];
  if (!row) throw notFound('Job');
  return serializeJob(row);
}

export async function retryJob(actor: Actor, id: string): Promise<Job> {
  return withTransaction(async (tx) => {
    const row = (await tx.select().from(jobs).where(eq(jobs.id, id)).limit(1))[0];
    if (!row) throw notFound('Job');
    if (!['failed', 'dead', 'cancelled'].includes(row.status)) {
      throw new AppError('invalid_state', 409, `A ${row.status} job cannot be retried`);
    }
    const updated = (
      await tx
        .update(jobs)
        .set({
          status: 'pending',
          runAt: new Date(),
          finishedAt: null,
          lockedAt: null,
          lockedBy: null,
          attempts: 0,
        })
        .where(eq(jobs.id, id))
        .returning()
    )[0]!;
    await recordAudit(tx, actor, {
      action: 'jobs.retry',
      entityType: 'job',
      entityId: id,
      before: serializeJob(row),
      after: serializeJob(updated),
    });
    return serializeJob(updated);
  });
}

export async function cancelJob(actor: Actor, id: string): Promise<Job> {
  return withTransaction(async (tx) => {
    const row = (await tx.select().from(jobs).where(eq(jobs.id, id)).limit(1))[0];
    if (!row) throw notFound('Job');
    if (row.status !== 'pending')
      throw new AppError('invalid_state', 409, `A ${row.status} job cannot be cancelled`);
    const updated = (
      await tx
        .update(jobs)
        .set({ status: 'cancelled', finishedAt: new Date() })
        .where(eq(jobs.id, id))
        .returning()
    )[0]!;
    await recordAudit(tx, actor, {
      action: 'jobs.cancel',
      entityType: 'job',
      entityId: id,
      before: serializeJob(row),
      after: serializeJob(updated),
    });
    return serializeJob(updated);
  });
}

export async function listSchedules(): Promise<Schedule[]> {
  const rows = await getDb().select().from(schedules).orderBy(schedules.name);
  return rows.map(serializeSchedule);
}

export async function updateSchedule(
  actor: Actor,
  name: string,
  enabled: boolean,
): Promise<Schedule> {
  return withTransaction(async (tx) => {
    const row = (await tx.select().from(schedules).where(eq(schedules.name, name)).limit(1))[0];
    if (!row) throw notFound('Schedule');
    const updated = (
      await tx
        .update(schedules)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(schedules.name, name))
        .returning()
    )[0]!;
    await recordAudit(tx, actor, {
      action: 'schedules.update',
      entityType: 'schedule',
      before: serializeSchedule(row),
      after: serializeSchedule(updated),
      metadata: { name },
    });
    return serializeSchedule(updated);
  });
}

export async function runScheduleNow(actor: Actor, name: string): Promise<Job> {
  return withTransaction(async (tx) => {
    const row = (await tx.select().from(schedules).where(eq(schedules.name, name)).limit(1))[0];
    if (!row) throw notFound('Schedule');
    const def = getJobDefinition(row.jobName);
    if (!def)
      throw new AppError(
        'invalid_state',
        409,
        `Schedule "${name}" points at unknown job "${row.jobName}"`,
      );
    const { id } = await enqueue(def, row.payload, { tx });
    await recordAudit(tx, actor, {
      action: 'schedules.run',
      entityType: 'schedule',
      metadata: { name, jobId: id },
    });
    const job = (await tx.select().from(jobs).where(eq(jobs.id, id)).limit(1))[0]!;
    return serializeJob(job);
  });
}
