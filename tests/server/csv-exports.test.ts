import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { json, signInAs } from './helpers';

// Every admin list page exports the same filtered, sorted rows as CSV.
describe('CSV exports of the platform lists', () => {
  const app = createApp();

  async function exportCsv(path: string, cookie: string) {
    const res = await app.request(path, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/csv/);
    expect(res.headers.get('content-disposition')).toMatch(
      /attachment; filename="[a-z-]+-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const text = (await res.text()).replace(/^﻿/, '').trim();
    return text.split('\r\n');
  }

  it('users, audit log, jobs and webhooks', async () => {
    const admin = await signInAs('a@example.com', 'admin');
    await signInAs('b@example.com', 'viewer');
    await app.request('/api/customers', json({ name: 'Csv Co' }, { cookie: admin.cookie }));

    const users = await exportCsv('/api/users?format=csv&sort=email&role=viewer', admin.cookie);
    expect(users[0]).toBe('id,email,name,role,status,lastLoginAt,createdAt');
    expect(users).toHaveLength(2);
    expect(users[1]).toContain('b@example.com');

    const audit = await exportCsv('/api/audit?format=csv&action=customers.create', admin.cookie);
    expect(audit[0]).toBe('id,at,actorType,actor,action,entityType,entityId,before,after,metadata');
    expect(audit).toHaveLength(2);
    expect(audit[1]).toContain('a@example.com');
    expect(audit[1]).toContain('""name"":""Csv Co""'); // JSON in a quoted cell

    const jobs = await exportCsv('/api/jobs?format=csv', admin.cookie);
    expect(jobs[0]).toBe(
      'id,name,status,attempts,maxAttempts,runAt,startedAt,finishedAt,lastError,payload',
    );
    expect(jobs.some((line) => line.includes('customers.after_create'))).toBe(true);

    const webhooks = await exportCsv('/api/webhooks?format=csv', admin.cookie);
    expect(webhooks[0]).toBe(
      'id,vendor,externalId,eventType,status,receivedAt,processedAt,attempts,error',
    );

    const viewer = await signInAs('v@example.com', 'viewer');
    expect(
      (await app.request('/api/users?format=csv', { headers: { cookie: viewer.cookie } })).status,
    ).toBe(403);
  });
});
