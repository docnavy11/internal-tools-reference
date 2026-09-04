import type { Job, Schedule } from '../../../shared/jobs';
import { describeCron, getJobDefinition } from './define';
import type { jobs, schedules } from './table';

export function serializeJob(row: typeof jobs.$inferSelect): Job {
  return {
    id: row.id,
    name: row.name,
    status: row.status as Job['status'],
    payload: getJobDefinition(row.name)?.sensitive ? '[redacted]' : row.payload,
    result: row.result ?? null,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    runAt: row.runAt.toISOString(),
    lockedAt: row.lockedAt?.toISOString() ?? null,
    lockedBy: row.lockedBy,
    lastError: row.lastError,
    dedupeKey: row.dedupeKey,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export function serializeSchedule(row: typeof schedules.$inferSelect): Schedule {
  return {
    name: row.name,
    cron: row.cron,
    description: describeCron(row.cron),
    jobName: row.jobName,
    payload: row.payload,
    enabled: row.enabled,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt.toISOString(),
  };
}
