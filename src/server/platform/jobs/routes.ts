import { Hono } from 'hono';
import { z } from 'zod';
import { jobFilters, jobSortColumns, scheduleUpdateInput } from '../../../shared/jobs';
import { requirePermission } from '../auth/middleware';
import { parseListQuery } from '../http/list';
import type { AppEnv } from '../http/types';
import { validate } from '../http/validate';
import { listJobNames } from './define';
import {
  cancelJob,
  getJob,
  listJobs,
  listSchedules,
  retryJob,
  runScheduleNow,
  updateSchedule,
} from './service';

const idParam = z.object({ id: z.string().uuid() });
const nameParam = z.object({ name: z.string().min(1).max(100) });

export function jobRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const manage = requirePermission('jobs:manage');

  r.get('/jobs', manage, async (c) =>
    c.json(await listJobs(parseListQuery(c.req.query(), jobFilters, jobSortColumns))),
  );
  r.get('/jobs/names', manage, (c) => c.json(listJobNames()));
  r.get('/jobs/:id', manage, validate('param', idParam), async (c) =>
    c.json(await getJob(c.req.valid('param').id)),
  );
  r.post('/jobs/:id/retry', manage, validate('param', idParam), async (c) =>
    c.json(await retryJob(c.get('actor'), c.req.valid('param').id)),
  );
  r.post('/jobs/:id/cancel', manage, validate('param', idParam), async (c) =>
    c.json(await cancelJob(c.get('actor'), c.req.valid('param').id)),
  );

  r.get('/schedules', manage, async (c) => c.json(await listSchedules()));
  r.patch(
    '/schedules/:name',
    manage,
    validate('param', nameParam),
    validate('json', scheduleUpdateInput),
    async (c) =>
      c.json(
        await updateSchedule(
          c.get('actor'),
          c.req.valid('param').name,
          c.req.valid('json').enabled,
        ),
      ),
  );
  r.post('/schedules/:name/run', manage, validate('param', nameParam), async (c) =>
    c.json(await runScheduleNow(c.get('actor'), c.req.valid('param').name)),
  );

  return r;
}
