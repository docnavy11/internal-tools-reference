import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { db as pool, getDb, withTransaction } from '../../src/server/platform/db/client';
import {
  defineJob,
  defineSchedule,
  describeCron,
  listScheduleDefinitions,
  nextRun,
  NonRetryableError,
} from '../../src/server/platform/jobs/define';
import { enqueue } from '../../src/server/platform/jobs/enqueue';
import { jobs, schedules } from '../../src/server/platform/jobs/table';
import {
  backoffMs,
  claimOne,
  reapStale,
  runJob,
  syncSchedules,
  tickScheduler,
} from '../../src/server/platform/jobs/worker';
import { auditRows, json, signInAs } from './helpers';

// Test-only jobs. Defined once per module load; the registry tolerates re-evaluation.
const calls: unknown[] = [];
const echo = defineJob('test.echo', z.object({ value: z.string() }), async (p) => {
  calls.push(p.value);
  return { echoed: p.value };
});
const flaky = defineJob(
  'test.flaky',
  z.object({ failTimes: z.number() }),
  async (p, ctx) => {
    if (ctx.attempt <= p.failTimes) throw new Error(`attempt ${ctx.attempt} failed`);
    return 'ok';
  },
  { maxAttempts: 3 },
);
const fatal = defineJob('test.fatal', z.object({}), async () => {
  throw new NonRetryableError('do not retry');
});
const slow = defineJob(
  'test.slow',
  z.object({}),
  async (_p, ctx) => new Promise((r) => setTimeout(r, 200, ctx.signal.aborted)),
  {
    timeoutMs: 50,
  },
);
defineSchedule('test.echo.hourly', '0 * * * *', echo, { value: 'scheduled' });

async function runNext(claimant = 'test') {
  const job = await claimOne(getDb(), claimant);
  if (!job) throw new Error('nothing to claim');
  return { job, outcome: await runJob(job) };
}

describe('job queue', () => {
  it('enqueues, claims and runs a job with its result', async () => {
    const { id } = await enqueue(echo, { value: 'hi' });
    const { job, outcome } = await runNext();
    expect(job.id).toBe(id);
    expect(job.attempts).toBe(1);
    expect(outcome.status).toBe('succeeded');
    const row = (await getDb().select().from(jobs).where(eq(jobs.id, id)))[0]!;
    expect(row).toMatchObject({
      status: 'succeeded',
      result: { echoed: 'hi' },
      lockedAt: null,
      lockedBy: null,
    });
    expect(row.finishedAt).toBeInstanceOf(Date);
    expect(await claimOne()).toBeNull();
  });

  it('does not claim jobs scheduled for later', async () => {
    await enqueue(echo, { value: 'later' }, { runAt: new Date(Date.now() + 60_000) });
    expect(await claimOne()).toBeNull();
  });

  it('rejects payloads that do not match the schema at enqueue time', async () => {
    await expect(enqueue(echo, { value: 42 as unknown as string })).rejects.toThrow();
  });

  it('retries with backoff, then dies after max attempts', async () => {
    const { id } = await enqueue(flaky, { failTimes: 5 });
    const first = await runNext();
    expect(first.outcome.status).toBe('failed');
    let row = (await getDb().select().from(jobs).where(eq(jobs.id, id)))[0]!;
    expect(row.status).toBe('pending');
    expect(row.lastError).toContain('attempt 1 failed');
    expect(row.runAt.getTime()).toBeGreaterThan(Date.now() + 20_000);

    // Pull the retry forward and exhaust the attempts.
    for (let attempt = 2; attempt <= 3; attempt++) {
      await getDb().update(jobs).set({ runAt: new Date() }).where(eq(jobs.id, id));
      const { outcome } = await runNext();
      expect(outcome.status).toBe(attempt < 3 ? 'failed' : 'dead');
    }
    row = (await getDb().select().from(jobs).where(eq(jobs.id, id)))[0]!;
    expect(row).toMatchObject({ status: 'dead', attempts: 3 });
  });

  it('succeeds on a later attempt', async () => {
    const { id } = await enqueue(flaky, { failTimes: 1 });
    await runNext();
    await getDb().update(jobs).set({ runAt: new Date() }).where(eq(jobs.id, id));
    const { outcome } = await runNext();
    expect(outcome.status).toBe('succeeded');
  });

  it('marks NonRetryableError dead immediately and times out slow handlers', async () => {
    await enqueue(fatal, {});
    expect((await runNext()).outcome).toMatchObject({ status: 'dead', error: 'do not retry' });

    const { id } = await enqueue(slow, {});
    const { outcome } = await runNext();
    expect(outcome.status).toBe('failed');
    expect((await getDb().select().from(jobs).where(eq(jobs.id, id)))[0]!.lastError).toMatch(
      /timed out/,
    );
  });

  it('dedupes on key while a job is live and releases the key when done', async () => {
    const a = await enqueue(echo, { value: '1' }, { dedupeKey: 'k' });
    const b = await enqueue(echo, { value: '2' }, { dedupeKey: 'k' });
    expect(b).toEqual({ id: a.id, deduped: true });
    await runNext();
    const c = await enqueue(echo, { value: '3' }, { dedupeKey: 'k' });
    expect(c.deduped).toBe(false);
    expect(c.id).not.toBe(a.id);
  });

  it('reaps jobs whose worker disappeared', async () => {
    const { id } = await enqueue(echo, { value: 'stuck' });
    const job = await claimOne(getDb(), 'crashed-worker');
    expect(job?.id).toBe(id);
    expect(await reapStale(getDb())).toBe(0); // lock is fresh
    await getDb()
      .update(jobs)
      .set({ lockedAt: new Date(Date.now() - 3 * 3600_000) })
      .where(eq(jobs.id, id));
    expect(await reapStale(getDb())).toBe(1);
    const row = (await getDb().select().from(jobs).where(eq(jobs.id, id)))[0]!;
    expect(row).toMatchObject({
      status: 'pending',
      lockedBy: null,
      lastError: 'worker lost (lock expired)',
    });
  });

  it('backoff grows and is capped', () => {
    expect(backoffMs(1)).toBeGreaterThanOrEqual(24_000);
    expect(backoffMs(1)).toBeLessThanOrEqual(36_000);
    expect(backoffMs(20)).toBeLessThanOrEqual(3600_000 * 1.2);
  });

  it('a job with no registered handler dies with a clear error', async () => {
    await getDb().insert(jobs).values({ name: 'ghost.job', payload: {} });
    const { outcome } = await runNext();
    expect(outcome).toMatchObject({
      status: 'dead',
      error: 'No handler registered for job "ghost.job"',
    });
  });
});

describe('job queue under concurrency (real pool, outside the test transaction)', () => {
  const marker = `conc-${Date.now()}`;
  afterAll(async () => {
    await pool.delete(jobs).where(eq(jobs.name, echo.name));
  });

  it('never hands the same job to two workers', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { id } = await enqueue(echo, { value: `${marker}-${i}` }, { tx: pool });
      ids.add(id);
    }
    const claimed: string[] = [];
    const worker = async (name: string) => {
      for (;;) {
        const job = await claimOne(pool, name);
        if (!job || !ids.has(job.id)) return;
        claimed.push(job.id);
        await runJob(job, pool);
      }
    };
    await Promise.all([worker('w1'), worker('w2'), worker('w3')]);
    expect(claimed.length).toBe(20);
    expect(new Set(claimed).size).toBe(20);
    const done = await pool
      .select({ status: jobs.status })
      .from(jobs)
      .where(inArray(jobs.id, [...ids]));
    expect(done.every((r) => r.status === 'succeeded')).toBe(true);
  });
});

describe('schedules', () => {
  it('describes common cron expressions', () => {
    expect(describeCron('0 2 * * *')).toBe('Daily at 02:00 UTC');
    expect(describeCron('*/15 * * * *')).toBe('Every 15 minutes');
    expect(describeCron('30 * * * *')).toBe('Hourly at :30');
    expect(describeCron('0 9 * * 1')).toBe('Weekly on Monday at 09:00 UTC');
    expect(describeCron('1 2 3 4 5')).toBe('1 2 3 4 5');
    expect(nextRun('0 * * * *', new Date('2026-01-01T10:15:00Z')).toISOString()).toBe(
      '2026-01-01T11:00:00.000Z',
    );
  });

  it('syncs definitions into the table and fires due ones exactly once', async () => {
    await syncSchedules();
    const names = listScheduleDefinitions().map((d) => d.name);
    const rows = await getDb().select().from(schedules);
    expect(rows.map((r) => r.name).sort()).toEqual([...names].sort());
    expect(names).toContain('customers.purge_deleted.daily');
    expect(names).toContain('jobs.cleanup.daily');

    // Make the test schedule due, keep the others in the future.
    await getDb()
      .update(schedules)
      .set({ nextRunAt: new Date(Date.now() - 1000) })
      .where(eq(schedules.name, 'test.echo.hourly'));
    expect(await tickScheduler()).toBe(1);
    expect(await tickScheduler()).toBe(0);
    const pending = await getDb().select().from(jobs).where(eq(jobs.name, echo.name));
    expect(pending).toHaveLength(1);
    expect(pending[0]!.dedupeKey).toMatch(/^schedule:test\.echo\.hourly:/);
    expect(pending[0]!.payload).toEqual({ value: 'scheduled' });
    const row = (
      await getDb().select().from(schedules).where(eq(schedules.name, 'test.echo.hourly'))
    )[0]!;
    expect(row.lastRunAt).toBeInstanceOf(Date);
    expect(row.nextRunAt.getTime()).toBeGreaterThan(Date.now());

    // Disabled schedules never fire.
    await getDb()
      .update(schedules)
      .set({ enabled: false, nextRunAt: new Date(Date.now() - 1000) })
      .where(eq(schedules.name, 'test.echo.hourly'));
    expect(await tickScheduler()).toBe(0);
  });
});

describe('jobs admin API', () => {
  const app = createApp();

  it('requires jobs:manage and lists, filters, retries and cancels', async () => {
    const member = await signInAs('m@example.com', 'member');
    const admin = await signInAs('a@example.com', 'admin');
    const h = { headers: { cookie: admin.cookie } };
    expect((await app.request('/api/jobs', { headers: { cookie: member.cookie } })).status).toBe(
      403,
    );

    await enqueue(fatal, {});
    const pending = await enqueue(echo, { value: 'x' }, { runAt: new Date(Date.now() + 60_000) });
    await runNext(); // fatal -> dead

    const list = await (await app.request('/api/jobs', h)).json();
    expect(list.total).toBe(2);
    expect(list.items[0].createdAt >= list.items[1].createdAt).toBe(true);
    const dead = await (await app.request('/api/jobs?status=dead', h)).json();
    expect(dead.items).toHaveLength(1);
    expect((await (await app.request(`/api/jobs?name=${echo.name}`, h)).json()).items).toHaveLength(
      1,
    );

    const names = await (await app.request('/api/jobs/names', h)).json();
    expect(names).toEqual(
      expect.arrayContaining(['customers.import', 'jobs.cleanup', 'test.echo']),
    );

    const retried = await app.request(`/api/jobs/${dead.items[0].id}/retry`, {
      method: 'POST',
      ...h,
    });
    expect(retried.status).toBe(200);
    expect((await retried.json()).status).toBe('pending');
    expect(await auditRows('jobs.retry', dead.items[0].id)).toHaveLength(1);
    const again = await app.request(`/api/jobs/${dead.items[0].id}/retry`, {
      method: 'POST',
      ...h,
    });
    expect(again.status).toBe(409);

    const cancelled = await app.request(`/api/jobs/${pending.id}/cancel`, { method: 'POST', ...h });
    expect((await cancelled.json()).status).toBe('cancelled');
    expect(
      (await app.request(`/api/jobs/${pending.id}/cancel`, { method: 'POST', ...h })).status,
    ).toBe(409);
  });

  it('lists schedules, toggles them and runs one now', async () => {
    const admin = await signInAs('a@example.com', 'admin');
    const h = { headers: { cookie: admin.cookie } };
    await syncSchedules();
    const list = await (await app.request('/api/schedules', h)).json();
    const cleanup = list.find((s: { name: string }) => s.name === 'jobs.cleanup.daily');
    expect(cleanup).toMatchObject({
      cron: '15 3 * * *',
      description: 'Daily at 03:15 UTC',
      jobName: 'jobs.cleanup',
      enabled: true,
    });

    const off = await app.request('/api/schedules/jobs.cleanup.daily', {
      ...json({ enabled: false }, { cookie: admin.cookie }),
      method: 'PATCH',
    });
    expect((await off.json()).enabled).toBe(false);
    expect(await auditRows('schedules.update')).toHaveLength(1);

    const run = await app.request('/api/schedules/jobs.cleanup.daily/run', {
      method: 'POST',
      ...h,
    });
    expect(run.status).toBe(200);
    const job = await run.json();
    expect(job).toMatchObject({ name: 'jobs.cleanup', status: 'pending' });
    expect((await app.request('/api/schedules/nope/run', { method: 'POST', ...h })).status).toBe(
      404,
    );
  });
});

describe('customers follow-up job', () => {
  it('is enqueued in the create transaction and records its audit entry when run', async () => {
    const app = createApp();
    const member = await signInAs('m@example.com', 'member');
    const created = await (
      await app.request('/api/customers', json({ name: 'Acme' }, { cookie: member.cookie }))
    ).json();
    const queued = await getDb().select().from(jobs).where(eq(jobs.name, 'customers.after_create'));
    expect(queued).toHaveLength(1);
    expect(queued[0]!.payload).toEqual({ customerId: created.id });
    const { outcome } = await runNext();
    expect(outcome.status).toBe('succeeded');
    const rows = await auditRows('customers.after_create', created.id);
    expect(rows[0]!.actorType).toBe('job');
  });

  it('purges soft-deleted customers older than the threshold', async () => {
    const { purgeDeletedCustomers } = await import('../../src/server/features/customers/jobs');
    const { customers } = await import('../../src/server/features/customers/table');
    const old = new Date(Date.now() - 40 * 24 * 3600_000);
    await getDb()
      .insert(customers)
      .values([
        { name: 'Old', deletedAt: old },
        { name: 'Recent', deletedAt: new Date() },
        { name: 'Live' },
      ]);
    await enqueue(purgeDeletedCustomers, { olderThanDays: 30 });
    const { outcome, job } = await runNext();
    expect(outcome.status).toBe('succeeded');
    const row = (await getDb().select().from(jobs).where(eq(jobs.id, job.id)))[0]!;
    expect(row.result).toEqual({ purged: 1 });
    const left = await getDb().select({ name: customers.name }).from(customers);
    expect(left.map((c) => c.name).sort()).toEqual(['Live', 'Recent']);
    expect(await auditRows('customers.purge')).toHaveLength(1);
  });
});

describe('customers CSV import', () => {
  const app = createApp();
  const csv = (rows: string[]) => ['name,email,status,plan,tags,owner,notes', ...rows].join('\n');
  const upload = (cookie: string, content: string, filename = 'x.csv') => {
    const form = new FormData();
    form.set('file', new File([content], filename, { type: 'text/csv' }));
    return app.request('/api/customers/import', {
      method: 'POST',
      body: form,
      headers: { cookie },
    });
  };

  it('serves a template and rejects files without a name column', async () => {
    const member = await signInAs('m@example.com', 'member');
    const tpl = await app.request('/api/customers/import/template', {
      headers: { cookie: member.cookie },
    });
    expect(tpl.headers.get('content-type')).toMatch(/csv/);
    expect((await tpl.text()).split('\r\n')[0]).toBe('name,email,status,plan,tags,owner,notes');

    const bad = await upload(member.cookie, 'foo,bar\n1,2');
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.details.formErrors[0]).toMatch(/needs a "name" column/);
    expect(
      (
        await app.request('/api/customers/import', {
          method: 'POST',
          headers: { cookie: member.cookie },
        })
      ).status,
    ).toBe(400);
  });

  it('accepts valid rows, rejects invalid ones with line numbers, and the job creates them', async () => {
    const member = await signInAs('m@example.com', 'member');
    const owner = await signInAs('owner@example.com', 'member');
    const viewer = await signInAs('v@example.com', 'viewer');
    expect((await upload(viewer.cookie, csv(['x']))).status).toBe(403);

    const res = await upload(
      member.cookie,
      csv([
        'Alpha,alpha@example.com,active,pro,vip;eu,owner@example.com,First',
        ',missing@example.com,active,pro,,,',
        'Gamma,not-an-email,bogus,free,,,',
        'Delta,,,,,nobody@example.com,',
        'Epsilon,,,,,,',
      ]),
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.accepted).toBe(3);
    expect(body.rejected.map((r: { line: number }) => r.line)).toEqual([3, 4]);
    expect(body.rejected[1].errors.join(' ')).toMatch(/email/);
    expect(body.rejected[1].errors.join(' ')).toMatch(/status/);

    const status0 = await (
      await app.request(`/api/customers/import/${body.jobId}`, {
        headers: { cookie: member.cookie },
      })
    ).json();
    expect(status0).toMatchObject({ jobId: body.jobId, status: 'pending', result: null });
    // Another member cannot follow someone else's import; an admin can.
    expect(
      (
        await app.request(`/api/customers/import/${body.jobId}`, {
          headers: { cookie: owner.cookie },
        })
      ).status,
    ).toBe(404);

    const { outcome } = await runNext();
    expect(outcome.status).toBe('succeeded');
    const status1 = await (
      await app.request(`/api/customers/import/${body.jobId}`, {
        headers: { cookie: member.cookie },
      })
    ).json();
    expect(status1.status).toBe('succeeded');
    expect(status1.result.created).toBe(2);
    expect(status1.result.failed).toEqual([{ line: 5, error: 'Unknown owner nobody@example.com' }]);

    const list = await (
      await app.request('/api/customers?sort=name', { headers: { cookie: member.cookie } })
    ).json();
    expect(list.items.map((c: { name: string }) => c.name)).toEqual(['Alpha', 'Epsilon']);
    expect(list.items[0]).toMatchObject({
      status: 'active',
      plan: 'pro',
      tags: ['vip', 'eu'],
      owner: { email: 'owner@example.com' },
    });
    const created = await auditRows('customers.create', list.items[0].id);
    expect(created[0]!.metadata).toMatchObject({
      import: true,
      requestedBy: member.user.id,
      line: 2,
    });
  });
});

// Keep unused helpers referenced for the linter in case a block above is trimmed.
void withTransaction;
