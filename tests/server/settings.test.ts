import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { customerSettings } from '../../src/server/features/customers/settings';
import { defineSettings, settingType } from '../../src/server/platform/settings/registry';
import {
  getSetting,
  invalidateSettingsCache,
  setSetting,
} from '../../src/server/platform/settings/service';
import { settings } from '../../src/server/platform/settings/table';
import { getDb } from '../../src/server/platform/db/client';
import { auditRows, json, signInAs } from './helpers';

const testSettings = defineSettings({
  'test.flag': { schema: z.boolean(), default: false, label: 'Flag', group: 'Test' },
  'test.mode': { schema: z.enum(['a', 'b']), default: 'a', label: 'Mode', group: 'Test' },
  'test.limit': { schema: z.number().int().min(1), default: 10, label: 'Limit', group: 'Test' },
  'test.name': { schema: z.string().min(1), default: 'x', label: 'Name', group: 'Test' },
});

describe('settings registry and service', () => {
  it('derives control types from the schemas', () => {
    expect(settingType(testSettings['test.flag'])).toEqual({ type: 'boolean', options: null });
    expect(settingType(testSettings['test.mode'])).toEqual({ type: 'enum', options: ['a', 'b'] });
    expect(settingType(testSettings['test.limit'])).toEqual({ type: 'number', options: null });
    expect(settingType(testSettings['test.name'])).toEqual({ type: 'string', options: null });
  });

  it('returns defaults, stores typed overrides with audit, resets, and refreshes the cache', async () => {
    invalidateSettingsCache();
    expect(await getSetting(testSettings['test.flag'])).toBe(false);
    const flag: boolean = await getSetting(testSettings['test.flag']); // typed
    expect(flag).toBe(false);

    const actor = { type: 'system' as const };
    const updated = await setSetting(actor, 'test.flag', true);
    expect(updated).toMatchObject({
      key: 'test.flag',
      value: true,
      overridden: true,
      default: false,
    });
    expect(await getSetting(testSettings['test.flag'])).toBe(true);
    const audit = await auditRows('settings.update');
    expect(audit[0]!.before).toEqual({ key: 'test.flag', value: false });
    expect(audit[0]!.after).toEqual({ key: 'test.flag', value: true });

    await expect(setSetting(actor, 'test.limit', 0)).rejects.toMatchObject({
      code: 'validation_error',
    });
    await expect(setSetting(actor, 'test.mode', 'z')).rejects.toMatchObject({
      code: 'validation_error',
    });
    await expect(setSetting(actor, 'nope', 1)).rejects.toMatchObject({ code: 'not_found' });

    const reset = await setSetting(actor, 'test.flag', null);
    expect(reset).toMatchObject({ value: false, overridden: false });
    expect(await getDb().select().from(settings)).toHaveLength(0);
  });

  it('falls back to the default when a stored value no longer fits the schema', async () => {
    await getDb().insert(settings).values({ key: 'test.limit', value: 'not-a-number' });
    invalidateSettingsCache();
    expect(await getSetting(testSettings['test.limit'])).toBe(10);
  });
});

describe('settings API', () => {
  const app = createApp();
  it('is admin-only and round-trips a change', async () => {
    const member = await signInAs('m@example.com', 'member');
    const admin = await signInAs('a@example.com', 'admin');
    expect(
      (await app.request('/api/settings', { headers: { cookie: member.cookie } })).status,
    ).toBe(403);

    const list = await (
      await app.request('/api/settings', { headers: { cookie: admin.cookie } })
    ).json();
    const slack = list.find((s: { key: string }) => s.key === 'customers.slack_on_create');
    expect(slack).toMatchObject({
      type: 'boolean',
      default: true,
      value: true,
      overridden: false,
      group: 'Customers',
    });
    const plan = list.find((s: { key: string }) => s.key === 'customers.default_plan');
    expect(plan.options).toEqual(['free', 'pro', 'enterprise']);

    const off = await app.request('/api/settings/customers.slack_on_create', {
      ...json({ value: false }, { cookie: admin.cookie }),
      method: 'PATCH',
    });
    expect(off.status).toBe(200);
    const body = await off.json();
    expect(body).toMatchObject({ value: false, overridden: true });
    expect(body.updatedBy.email).toBe('a@example.com');

    const bad = await app.request('/api/settings/customers.trash_days', {
      ...json({ value: 0 }, { cookie: admin.cookie }),
      method: 'PATCH',
    });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.details.formErrors[0]).toMatch(/greater than or equal to 1/);
    expect(
      (
        await app.request('/api/settings/does.not.exist', {
          ...json({ value: 1 }, { cookie: admin.cookie }),
          method: 'PATCH',
        })
      ).status,
    ).toBe(404);
  });

  it('gates the Slack announcement on the setting', async () => {
    const { drainJobs } = await import('./helpers');
    const { setSlackDriver } = await import('../../src/server/platform/notify/slack');
    const posted: unknown[] = [];
    setSlackDriver({ post: async (m) => void posted.push(m) });
    try {
      const admin = await signInAs('a@example.com', 'admin');
      await setSetting({ type: 'user', userId: admin.user.id }, 'customers.slack_on_create', false);
      await app.request('/api/customers', json({ name: 'Quiet Co' }, { cookie: admin.cookie }));
      const outcomes = await drainJobs();
      expect(outcomes.map((o) => o.name)).toEqual(['customers.after_create']);
      expect(posted).toHaveLength(0);
      expect((await auditRows('customers.after_create'))[0]!.metadata).toMatchObject({
        notified: false,
      });
      expect(await getSetting(customerSettings['customers.trash_days'])).toBe(30);
    } finally {
      setSlackDriver(null);
    }
  });
});
