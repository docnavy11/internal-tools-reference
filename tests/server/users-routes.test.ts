import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { updateUser } from '../../src/server/platform/users/service';
import { auditRows, expectAudited, json, signInAs } from './helpers';

const app = createApp();
const patch = (body: unknown, cookie: string) => ({ ...json(body, { cookie }), method: 'PATCH' });

describe('users admin API', () => {
  it('is only reachable with users:manage', async () => {
    const member = await signInAs('m@example.com', 'member');
    expect((await app.request('/api/users', { headers: { cookie: member.cookie } })).status).toBe(
      403,
    );
    expect((await app.request('/api/users')).status).toBe(401);
    const admin = await signInAs('a@example.com', 'admin');
    expect((await app.request('/api/users', { headers: { cookie: admin.cookie } })).status).toBe(
      200,
    );
  });

  it('lists with filters, sorting and paging', async () => {
    const admin = await signInAs('admin@example.com', 'admin');
    await signInAs('bob@example.com', 'viewer');
    await signInAs('carol@example.com', 'member');
    const h = { headers: { cookie: admin.cookie } };

    const all = await (await app.request('/api/users?sort=email&order=asc', h)).json();
    expect(all.total).toBe(3);
    expect(all.items.map((u: { email: string }) => u.email)).toEqual([
      'admin@example.com',
      'bob@example.com',
      'carol@example.com',
    ]);

    const paged = await (await app.request('/api/users?sort=email&pageSize=2&page=2', h)).json();
    expect(paged.items).toHaveLength(1);
    expect(paged).toMatchObject({ page: 2, pageSize: 2, total: 3 });

    const viewers = await (await app.request('/api/users?role=viewer', h)).json();
    expect(viewers.items.map((u: { email: string }) => u.email)).toEqual(['bob@example.com']);

    const search = await (await app.request('/api/users?q=CAR', h)).json();
    expect(search.total).toBe(1);

    const badSort = await app.request('/api/users?sort=password', h);
    expect(badSort.status).toBe(400);
    expect((await badSort.json()).error.code).toBe('bad_request');
  });

  it('invites once and audits it', async () => {
    const admin = await signInAs('admin@example.com', 'admin');
    const created = await app.request(
      '/api/users',
      json({ email: 'New@Partner.org', role: 'viewer' }, { cookie: admin.cookie }),
    );
    expect(created.status).toBe(201);
    const user = await created.json();
    expect(user).toMatchObject({ email: 'new@partner.org', role: 'viewer', status: 'active' });
    const rows = await expectAudited('users.invite', user.id);
    expect(rows[0]!.actorId).toBe(admin.user.id);

    const dup = await app.request(
      '/api/users',
      json({ email: 'new@partner.org' }, { cookie: admin.cookie }),
    );
    expect(dup.status).toBe(409);
    expect((await dup.json()).error.code).toBe('already_exists');
  });

  it('changes role and status with audit, and disabling revokes sessions', async () => {
    const admin = await signInAs('admin@example.com', 'admin');
    const bob = await signInAs('bob@example.com', 'member');

    const roleRes = await app.request(
      `/api/users/${bob.user.id}`,
      patch({ role: 'admin' }, admin.cookie),
    );
    expect(roleRes.status).toBe(200);
    expect((await roleRes.json()).role).toBe('admin');
    const audit = await expectAudited('users.update', bob.user.id);
    expect(audit[0]!.before).toMatchObject({ role: 'member' });
    expect(audit[0]!.after).toMatchObject({ role: 'admin' });

    expect((await app.request('/api/me', { headers: { cookie: bob.cookie } })).status).toBe(200);
    const disable = await app.request(
      `/api/users/${bob.user.id}`,
      patch({ status: 'disabled' }, admin.cookie),
    );
    expect(disable.status).toBe(200);
    expect((await app.request('/api/me', { headers: { cookie: bob.cookie } })).status).toBe(401);
    await expectAudited('users.revoke_sessions', bob.user.id);
  });

  it('refuses self changes and empty updates', async () => {
    const admin = await signInAs('admin@example.com', 'admin');
    const self = await app.request(
      `/api/users/${admin.user.id}`,
      patch({ role: 'member' }, admin.cookie),
    );
    expect(self.status).toBe(400);
    expect((await self.json()).error.code).toBe('self_change');

    const empty = await app.request(`/api/users/${admin.user.id}`, patch({}, admin.cookie));
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.code).toBe('validation_error');

    const missing = await app.request(
      '/api/users/00000000-0000-0000-0000-000000000000',
      patch({ role: 'viewer' }, admin.cookie),
    );
    expect(missing.status).toBe(404);
  });

  it('never removes the last active admin (service-level guard)', async () => {
    const admin = await signInAs('only@example.com', 'admin');
    await expect(
      updateUser({ type: 'system' }, admin.user.id, { role: 'member' }),
    ).rejects.toMatchObject({ code: 'last_admin' });
    await expect(
      updateUser({ type: 'system' }, admin.user.id, { status: 'disabled' }),
    ).rejects.toMatchObject({ code: 'last_admin' });
    await signInAs('second@example.com', 'admin');
    await expect(
      updateUser({ type: 'system' }, admin.user.id, { role: 'member' }),
    ).resolves.toMatchObject({ role: 'member' });
  });

  it('revokes sessions on request', async () => {
    const admin = await signInAs('admin@example.com', 'admin');
    const bob = await signInAs('bob@example.com', 'member');
    const res = await app.request(`/api/users/${bob.user.id}/revoke-sessions`, {
      method: 'POST',
      headers: { cookie: admin.cookie },
    });
    expect(res.status).toBe(204);
    expect((await app.request('/api/me', { headers: { cookie: bob.cookie } })).status).toBe(401);
    expect((await auditRows('users.revoke_sessions', bob.user.id))[0]!.metadata).toMatchObject({
      revoked: 1,
    });
  });
});
