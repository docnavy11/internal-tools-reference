import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../src/server/env';
import { createApp } from '../../src/server/app';
import { jobs } from '../../src/server/platform/jobs/table';
import { webhookEvents } from '../../src/server/platform/webhooks/table';
import { getDb } from '../../src/server/platform/db/client';
import { auditRows, drainJobs, signInAs } from './helpers';

const SECRET = 'test-webhook-secret';
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  // The example vendor registers only when configured. env is a plain object in tests.
  env.EXAMPLE_VENDOR_API_KEY = 'test-key';
  env.EXAMPLE_VENDOR_WEBHOOK_SECRET = SECRET;
  app = createApp();
});

function signed(body: string, opts: { secret?: string; ts?: number } = {}) {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', opts.secret ?? SECRET)
    .update(`${ts}.${body}`)
    .digest('hex');
  return {
    'content-type': 'application/json',
    'x-example-signature': `sha256=${sig}`,
    'x-example-timestamp': String(ts),
  };
}

const deliver = (body: string, headers: Record<string, string>) =>
  app.request('/api/webhooks/example-vendor', { method: 'POST', body, headers });

describe('inbound webhooks', () => {
  it('accepts a signed event, stores it, processes it in a job, and audits the handler', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'widget.updated', data: { widgetId: 'w1' } });
    const res = await deliver(body, signed(body));
    expect(res.status).toBe(200);
    const { id } = await res.json();
    const row = (await getDb().select().from(webhookEvents).where(eq(webhookEvents.id, id)))[0]!;
    expect(row).toMatchObject({
      vendor: 'example-vendor',
      externalId: 'evt_1',
      eventType: 'widget.updated',
      processedAt: null,
    });
    expect(row.headers).toMatchObject({ 'x-example-timestamp': expect.any(String) });

    const outcomes = await drainJobs();
    expect(outcomes).toEqual([
      expect.objectContaining({ name: 'webhooks.process', status: 'succeeded' }),
    ]);
    const after = (await getDb().select().from(webhookEvents).where(eq(webhookEvents.id, id)))[0]!;
    expect(after.processedAt).toBeInstanceOf(Date);
    expect(after.attempts).toBe(1);
    const audit = await auditRows('example_vendor.event', id);
    expect(audit[0]!.actorType).toBe('job');
    expect(audit[0]!.after).toMatchObject({ type: 'widget.updated' });
  });

  it('rejects bad signatures, stale timestamps and non-JSON bodies', async () => {
    const body = JSON.stringify({ id: 'evt_2', type: 'x' });
    expect((await deliver(body, signed(body, { secret: 'wrong' }))).status).toBe(401);
    expect(
      (await deliver(body, signed(body, { ts: Math.floor(Date.now() / 1000) - 3600 }))).status,
    ).toBe(401);
    expect((await deliver(body, { 'content-type': 'application/json' })).status).toBe(401);
    expect((await deliver('not json', signed('not json'))).status).toBe(400);
    expect(await getDb().select().from(webhookEvents)).toHaveLength(0);
  });

  it('acknowledges duplicate deliveries without processing twice', async () => {
    const body = JSON.stringify({ id: 'evt_dup', type: 'widget.updated' });
    expect((await deliver(body, signed(body))).status).toBe(200);
    const again = await deliver(body, signed(body));
    expect(await again.json()).toEqual({ ok: true, duplicate: true });
    expect(await getDb().select().from(webhookEvents)).toHaveLength(1);
    expect(await getDb().select().from(jobs).where(eq(jobs.name, 'webhooks.process'))).toHaveLength(
      1,
    );
  });

  it('records handler failures on the event and lets the job retry', async () => {
    const body = JSON.stringify({ id: 'evt_fail', type: 'widget.failing' });
    const { id } = await (await deliver(body, signed(body))).json();
    const [outcome] = await drainJobs();
    expect(outcome).toMatchObject({ status: 'failed' });
    const row = (await getDb().select().from(webhookEvents).where(eq(webhookEvents.id, id)))[0]!;
    expect(row).toMatchObject({
      processedAt: null,
      error: 'simulated handler failure',
      attempts: 1,
    });
    // The handler's own writes were rolled back with its transaction.
    expect(await auditRows('example_vendor.event', id)).toHaveLength(0);
  });

  it('admin API lists, filters, shows detail and replays', async () => {
    const member = await signInAs('m@example.com', 'member');
    const admin = await signInAs('a@example.com', 'admin');
    const h = { headers: { cookie: admin.cookie } };
    const ok = JSON.stringify({ id: 'evt_a', type: 'widget.updated' });
    const bad = JSON.stringify({ id: 'evt_b', type: 'widget.failing' });
    await deliver(ok, signed(ok));
    await deliver(bad, signed(bad));
    await drainJobs();

    expect(
      (await app.request('/api/webhooks', { headers: { cookie: member.cookie } })).status,
    ).toBe(403);
    const all = await (await app.request('/api/webhooks', h)).json();
    expect(all.total).toBe(2);
    const failed = await (await app.request('/api/webhooks?status=failed', h)).json();
    expect(failed.items.map((e: { externalId: string }) => e.externalId)).toEqual(['evt_b']);
    const processed = await (
      await app.request('/api/webhooks?status=processed&vendor=example-vendor', h)
    ).json();
    expect(processed.items[0].externalId).toBe('evt_a');
    expect(await (await app.request('/api/webhooks/vendors', h)).json()).toEqual([
      'example-vendor',
    ]);

    const detail = await (await app.request(`/api/webhooks/${failed.items[0].id}`, h)).json();
    expect(detail.payload).toEqual({ id: 'evt_b', type: 'widget.failing' });
    expect(detail.headers['x-example-signature']).toMatch(/^sha256=/);

    const replay = await app.request(`/api/webhooks/${processed.items[0].id}/replay`, {
      method: 'POST',
      ...h,
    });
    expect(replay.status).toBe(200);
    expect((await replay.json()).name).toBe('webhooks.process');
    const pending = await (await app.request('/api/webhooks?status=pending', h)).json();
    expect(pending.items.map((e: { externalId: string }) => e.externalId)).toEqual(['evt_a']);
    await drainJobs();
    expect(
      (await (await app.request(`/api/webhooks/${processed.items[0].id}`, h)).json()).status,
    ).toBe('processed');
    expect(await auditRows('webhooks.replay')).toHaveLength(1);
  });
});
