// cron-parser is CommonJS: Node's ESM loader only offers the default export, so a named
// import works under tsx and Vitest but fails in the esbuild bundle. Destructure instead.
import cronParser from 'cron-parser';
import type { z } from 'zod';
import type { Actor } from '../audit/record';
import type { Logger } from '../http/logger';

// Job handlers and schedules are declared in code with these two functions. Definitions
// are collected at import time; src/server/features/index.ts imports every feature's
// jobs.ts so both web and worker processes know the full registry.

const { parseExpression } = cronParser;

export interface JobContext {
  jobId: string;
  attempt: number;
  log: Logger;
  actor: Actor;
  signal: AbortSignal;
}

export interface JobOptions {
  maxAttempts?: number; // default 5
  timeoutMs?: number; // default 60s
}

// Schemas may use preprocess/default, so the input type is unknown; T is the output.
export type JobSchema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

export interface JobDefinition<T = unknown> {
  name: string;
  schema: JobSchema<T>;
  handler: (payload: T, ctx: JobContext) => Promise<unknown>;
  maxAttempts: number;
  timeoutMs: number;
}

// Thrown by a handler to mark the job dead immediately instead of retrying.
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

const jobRegistry = new Map<string, JobDefinition<unknown>>();

export function defineJob<T>(
  name: string,
  schema: JobSchema<T>,
  handler: (payload: T, ctx: JobContext) => Promise<unknown>,
  options: JobOptions = {},
): JobDefinition<T> {
  const existing = jobRegistry.get(name);
  // Modules may be evaluated more than once in tests; the same name must mean the same job.
  if (existing && existing.handler !== (handler as JobDefinition<unknown>['handler'])) {
    throw new Error(`Job "${name}" is already defined`);
  }
  const definition: JobDefinition<T> = {
    name,
    schema,
    handler,
    maxAttempts: options.maxAttempts ?? 5,
    timeoutMs: options.timeoutMs ?? 60_000,
  };
  jobRegistry.set(name, definition as JobDefinition<unknown>);
  return definition;
}

export function getJobDefinition(name: string): JobDefinition<unknown> | undefined {
  return jobRegistry.get(name);
}

export function listJobNames(): string[] {
  return [...jobRegistry.keys()].sort();
}

export function maxJobTimeoutMs(): number {
  let max = 60_000;
  for (const def of jobRegistry.values()) max = Math.max(max, def.timeoutMs);
  return max;
}

export interface ScheduleDefinition {
  name: string;
  cron: string;
  job: JobDefinition<unknown>;
  payload: unknown;
}

const scheduleRegistry = new Map<string, ScheduleDefinition>();

export function defineSchedule<T>(
  name: string,
  cron: string,
  job: JobDefinition<T>,
  payload: T,
): ScheduleDefinition {
  parseExpression(cron); // throws on an invalid expression at startup, not at 2am
  job.schema.parse(payload);
  const def: ScheduleDefinition = { name, cron, job: job as JobDefinition<unknown>, payload };
  scheduleRegistry.set(name, def);
  return def;
}

export function listScheduleDefinitions(): ScheduleDefinition[] {
  return [...scheduleRegistry.values()];
}

export function nextRun(cron: string, after = new Date()): Date {
  return parseExpression(cron, { currentDate: after }).next().toDate();
}

// Short human rendering for the admin page. Falls back to the expression.
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = parts as [string, string, string, string, string];
  const pad = (v: string) => v.padStart(2, '0');
  const every = /^\*\/(\d+)$/.exec(min);
  if (every && hour === '*' && dom === '*' && mon === '*' && dow === '*')
    return `Every ${every[1]} minutes`;
  if (/^\d+$/.test(min) && hour === '*' && dom === '*' && mon === '*' && dow === '*')
    return `Hourly at :${pad(min)}`;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*')
    return `Daily at ${pad(hour)}:${pad(min)} UTC`;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (
    /^\d+$/.test(min) &&
    /^\d+$/.test(hour) &&
    dom === '*' &&
    mon === '*' &&
    /^[0-6]$/.test(dow)
  ) {
    return `Weekly on ${days[Number(dow)]} at ${pad(hour)}:${pad(min)} UTC`;
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && mon === '*' && dow === '*') {
    return `Monthly on day ${dom} at ${pad(hour)}:${pad(min)} UTC`;
  }
  return cron;
}
