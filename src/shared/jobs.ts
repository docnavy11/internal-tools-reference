import { z } from 'zod';
import { csvArray } from './query';

// Jobs admin API (permission jobs:manage). See docs/blocks/06-jobs-and-cron.md.

export const jobStatuses = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'dead',
  'cancelled',
] as const;
export const jobStatus = z.enum(jobStatuses);
export type JobStatus = z.infer<typeof jobStatus>;

export const jobSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: jobStatus,
  payload: z.unknown(),
  result: z.unknown().nullable(),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  runAt: z.string().datetime(),
  lockedAt: z.string().datetime().nullable(),
  lockedBy: z.string().nullable(),
  lastError: z.string().nullable(),
  dedupeKey: z.string().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
});
export type Job = z.infer<typeof jobSchema>;

// GET /api/jobs query parameters on top of page/pageSize/sort/order.
export const jobFilters = z.object({
  status: csvArray(jobStatus),
  name: z.string().max(100).optional(),
});
export type JobFilters = z.infer<typeof jobFilters>;
export const jobSortColumns = [
  'createdAt',
  'runAt',
  'finishedAt',
  'name',
  'status',
  'attempts',
] as const;

export const scheduleSchema = z.object({
  name: z.string(),
  cron: z.string(),
  description: z.string(), // human-readable rendering of the cron expression
  jobName: z.string(),
  payload: z.unknown(),
  enabled: z.boolean(),
  lastRunAt: z.string().datetime().nullable(),
  nextRunAt: z.string().datetime(),
});
export type Schedule = z.infer<typeof scheduleSchema>;

// PATCH /api/schedules/:name
export const scheduleUpdateInput = z.object({ enabled: z.boolean() });
