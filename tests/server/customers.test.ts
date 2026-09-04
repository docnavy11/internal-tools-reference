import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { auditRows, json, signInAs } from './helpers';

const app = createApp();
const patch = (body: unknown, cookie: string) => ({ ...json(body, { cookie }), method: 'PATCH' });

async function create(cookie: string, body: Record<string, unknown>) {
  const res = await app.request('/api/customers', json({ name: 'Acme', ...body }, { cookie }));
  expect(res.status, await res.clone().text()).toBe(201);
  return res.json();
}

describe('customers API', () => {
  it('enforces read, write and delete permissions by role', async () => {
    const viewer = await signInAs('v@example.com', 'viewer');
    const member = await signInAs('m@example.com', 'member');
    const admin = await signInAs('a@example.com', 'admin');

    expect(
      (await app.request('/api/customers', { headers: { cookie: viewer.cookie } })).status,
    ).toBe(200);
    expect(
      (await app.request('/api/customers', json({ name: 'x' }, { cookie: viewer.cookie }))).status,
    ).toBe(403);

    const created = await create(member.cookie, {});
    expect(
      (
        await app.request(`/api/customers/${created.id}`, {
          method: 'DELETE',
          headers: { cookie: member.cookie },
        })
      ).status,
    ).toBe(403);
    const bulkDelete = await app.request(
      '/api/customers/bulk',
      json({ action: 'delete', ids: [created.id] }, { cookie: member.cookie }),
    );
    expect(bulkDelete.status).toBe(403);
    expect(
      (
        await app.request(`/api/customers/${created.id}`, {
          method: 'DELETE',
          headers: { cookie: admin.cookie },
        })
      ).status,
    ).toBe(204);
  });

  it('creates with defaults, validates input, and audits with the API shape', async () => {
    const member = await signInAs('m@example.com', 'member');
    const customer = await create(member.cookie, { tags: ['vip', 'vip', 'eu'] });
    expect(customer).toMatchObject({
      name: 'Acme',
      status: 'lead',
      plan: 'free',
      tags: ['vip', 'eu'],
      owner: null,
      deletedAt: null,
    });

    const rows = await auditRows('customers.create', customer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.after).toEqual(customer);
    expect(rows[0]!.actorId).toBe(member.user.id);

    const bad = await app.request(
      '/api/customers',
      json({ name: '', email: 'nope' }, { cookie: member.cookie }),
    );
    expect(bad.status).toBe(400);
    const body = await bad.json();
    expect(Object.keys(body.error.details.fieldErrors).sort()).toEqual(['email', 'name']);

    const badOwner = await app.request(
      '/api/customers',
      json(
        { name: 'x', ownerId: '00000000-0000-0000-0000-000000000000' },
        { cookie: member.cookie },
      ),
    );
    expect(badOwner.status).toBe(400);
    expect((await badOwner.json()).error.details.fieldErrors.ownerId).toBeDefined();
  });

  it('updates with before/after audit and resolves the owner', async () => {
    const member = await signInAs('m@example.com', 'member');
    const owner = await signInAs('o@example.com', 'member');
    const customer = await create(member.cookie, {});
    const res = await app.request(
      `/api/customers/${customer.id}`,
      patch({ status: 'active', ownerId: owner.user.id }, member.cookie),
    );
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.status).toBe('active');
    expect(updated.owner).toEqual({ id: owner.user.id, name: 'o', email: 'o@example.com' });
    expect(updated.updatedAt).not.toBeNull();

    const [row] = await auditRows('customers.update', customer.id);
    expect(row!.before).toMatchObject({ status: 'lead', owner: null });
    expect(row!.after).toMatchObject({ status: 'active' });

    const unknownField = await app.request(
      `/api/customers/${customer.id}`,
      patch({ nope: 1 }, member.cookie),
    );
    expect(unknownField.status).toBe(200); // unknown keys are stripped, not rejected
  });

  it('lists with filters, search, sort, paging and excludes deleted by default', async () => {
    const admin = await signInAs('a@example.com', 'admin');
    const h = { headers: { cookie: admin.cookie } };
    const a = await create(admin.cookie, {
      name: 'Alpha',
      status: 'active',
      plan: 'pro',
      tags: ['eu'],
    });
    await create(admin.cookie, { name: 'Beta', status: 'lead', email: 'beta@corp.com' });
    const gone = await create(admin.cookie, { name: 'Gone', status: 'churned' });
    await app.request(`/api/customers/${gone.id}`, { method: 'DELETE', ...h });

    const all = await (await app.request('/api/customers?sort=name', h)).json();
    expect(all.items.map((c: { name: string }) => c.name)).toEqual(['Alpha', 'Beta']);

    const withDeleted = await (
      await app.request('/api/customers?sort=name&includeDeleted=true', h)
    ).json();
    expect(withDeleted.total).toBe(3);
    expect(withDeleted.items[2].deletedAt).not.toBeNull();

    const multi = await (
      await app.request('/api/customers?status=active,churned&includeDeleted=true', h)
    ).json();
    expect(multi.total).toBe(2);

    expect((await (await app.request('/api/customers?plan=pro', h)).json()).items[0].id).toBe(a.id);
    expect((await (await app.request('/api/customers?tag=eu', h)).json()).total).toBe(1);
    expect((await (await app.request('/api/customers?q=corp', h)).json()).items[0].name).toBe(
      'Beta',
    );

    const paged = await (
      await app.request('/api/customers?sort=name&order=desc&pageSize=1&page=2', h)
    ).json();
    expect(paged.items[0].name).toBe('Alpha');
    expect(paged).toMatchObject({ total: 2, page: 2, pageSize: 1 });

    expect((await app.request('/api/customers?status=bogus', h)).status).toBe(400);
    expect((await app.request('/api/customers?sort=owner', h)).status).toBe(400);
  });

  it('soft deletes, blocks edits while deleted, restores, and shows history newest first', async () => {
    const admin = await signInAs('a@example.com', 'admin');
    const h = { headers: { cookie: admin.cookie } };
    const c = await create(admin.cookie, {});
    await app.request(`/api/customers/${c.id}`, patch({ name: 'Acme Ltd' }, admin.cookie));
    expect((await app.request(`/api/customers/${c.id}`, { method: 'DELETE', ...h })).status).toBe(
      204,
    );

    const detail = await (await app.request(`/api/customers/${c.id}`, h)).json();
    expect(detail.deletedAt).not.toBeNull();
    const blocked = await app.request(`/api/customers/${c.id}`, patch({ name: 'x' }, admin.cookie));
    expect(blocked.status).toBe(409);

    const restored = await (
      await app.request(`/api/customers/${c.id}/restore`, { method: 'POST', ...h })
    ).json();
    expect(restored.deletedAt).toBeNull();

    const history = await (
      await app.request(`/api/customers/${c.id}/history?pageSize=10`, h)
    ).json();
    expect(history.items.map((e: { action: string }) => e.action)).toEqual([
      'customers.restore',
      'customers.delete',
      'customers.update',
      'customers.create',
    ]);
    expect(history.items[0].actor).toMatchObject({ email: 'a@example.com' });
    expect(history.total).toBe(4);
  });

  it('bulk updates only what changes and audits each record', async () => {
    const admin = await signInAs('a@example.com', 'admin');
    const a = await create(admin.cookie, { name: 'A', status: 'lead' });
    const b = await create(admin.cookie, { name: 'B', status: 'active' });
    const res = await app.request(
      '/api/customers/bulk',
      json({ action: 'set_status', ids: [a.id, b.id], status: 'active' }, { cookie: admin.cookie }),
    );
    expect(await res.json()).toEqual({ affected: 1 });
    const rows = await auditRows('customers.update', a.id);
    expect(rows[0]!.metadata).toMatchObject({ bulk: 'set_status' });
    expect(await auditRows('customers.update', b.id)).toHaveLength(0);

    const del = await app.request(
      '/api/customers/bulk',
      json({ action: 'delete', ids: [a.id, b.id] }, { cookie: admin.cookie }),
    );
    expect(await del.json()).toEqual({ affected: 2 });
    expect(
      (await (await app.request('/api/customers', { headers: { cookie: admin.cookie } })).json())
        .total,
    ).toBe(0);
  });

  it('exports the filtered list as CSV with safe escaping', async () => {
    const admin = await signInAs('a@example.com', 'admin');
    await create(admin.cookie, { name: 'Quote "Co", Ltd', status: 'active', tags: ['a', 'b'] });
    await create(admin.cookie, { name: '=cmd()', status: 'active' });
    await create(admin.cookie, { name: 'Other', status: 'lead' });
    const res = await app.request('/api/customers?format=csv&status=active&sort=name', {
      headers: { cookie: admin.cookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/csv/);
    expect(res.headers.get('content-disposition')).toMatch(
      /attachment; filename="customers-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const text = await res.text();
    const lines = text
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('id,name,email,status,plan,tags,owner,createdAt,updatedAt');
    expect(lines[1]).toContain(",'=cmd(),"); // formula prefix neutralised; sorts first by name
    expect(lines[2]).toContain('"Quote ""Co"", Ltd"');
    expect(lines[2]).toContain(',a;b,');
  });
});

describe('audit API and user options', () => {
  it('lists audit entries with filters and exposes meta', async () => {
    const admin = await signInAs('a@example.com', 'admin');
    const member = await signInAs('m@example.com', 'member');
    const h = { headers: { cookie: admin.cookie } };
    const c = await create(member.cookie, {});
    await app.request(`/api/customers/${c.id}`, patch({ plan: 'pro' }, admin.cookie));

    expect((await app.request('/api/audit', { headers: { cookie: member.cookie } })).status).toBe(
      403,
    );

    const all = await (await app.request('/api/audit', h)).json();
    expect(all.items[0].action).toBe('customers.update');
    expect(all.items[0].actor.email).toBe('a@example.com');

    const byActor = await (await app.request(`/api/audit?actorId=${member.user.id}`, h)).json();
    expect(byActor.items.map((e: { action: string }) => e.action)).toEqual(['customers.create']);

    const since = new Date(Date.now() + 60_000).toISOString();
    expect(
      (await (await app.request(`/api/audit?from=${encodeURIComponent(since)}`, h)).json()).total,
    ).toBe(0);

    const meta = await (await app.request('/api/audit/meta', h)).json();
    expect(meta.actions).toEqual(expect.arrayContaining(['customers.create', 'customers.update']));
    expect(meta.entityTypes).toEqual(['customer']);
  });

  it('user options are available to any signed-in user and exclude disabled users', async () => {
    const viewer = await signInAs('v@example.com', 'viewer');
    await signInAs('x@example.com', 'member');
    const res = await app.request('/api/users/options', { headers: { cookie: viewer.cookie } });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.map((u: { email: string }) => u.email).sort()).toEqual([
      'v@example.com',
      'x@example.com',
    ]);
    expect(Object.keys(list[0]).sort()).toEqual(['email', 'id', 'name']);
    expect((await app.request('/api/users/options')).status).toBe(401);
  });
});
