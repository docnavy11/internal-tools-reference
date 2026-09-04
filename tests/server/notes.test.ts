import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { diskDriver } from '../../src/server/platform/storage/disk';
import { setStorageDriver } from '../../src/server/platform/storage/service';
import { auditRows, drainJobs, json, signInAs } from './helpers';
import { setSlackDriver, type SlackMessage } from '../../src/server/platform/notify/slack';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'itr-notes-'));
  setStorageDriver(diskDriver(dir));
});
afterAll(async () => {
  setStorageDriver(null);
  await rm(dir, { recursive: true, force: true });
});

const app = createApp();

async function createCustomer(cookie: string, name = 'Acme') {
  const res = await app.request('/api/customers', json({ name }, { cookie }));
  expect(res.status).toBe(201);
  return res.json();
}

function noteForm(body: string, file?: { name: string; content: string }) {
  const form = new FormData();
  form.set('body', body);
  if (file) form.set('file', new File([file.content], file.name, { type: 'text/plain' }));
  return form;
}

async function postNote(
  cookie: string,
  customerId: string,
  body: string,
  file?: { name: string; content: string },
) {
  return app.request(`/api/customers/${customerId}/notes`, {
    method: 'POST',
    body: noteForm(body, file),
    headers: { cookie },
  });
}

describe('notes', () => {
  it('creates notes with and without attachments, lists newest first, counts on the customer', async () => {
    const member = await signInAs('m@example.com', 'member');
    const customer = await createCustomer(member.cookie);
    expect(customer.notesCount).toBe(0);

    const first = await postNote(member.cookie, customer.id, 'First note');
    expect(first.status).toBe(201);
    const second = await postNote(member.cookie, customer.id, 'With file', {
      name: 'brief.txt',
      content: 'the brief',
    });
    expect(second.status).toBe(201);
    const withFile = await second.json();
    expect(withFile.author.email).toBe('m@example.com');
    expect(withFile.attachment).toMatchObject({
      filename: 'brief.txt',
      contentType: 'text/plain',
      sizeBytes: 9,
      entityType: 'note',
      entityId: withFile.id,
    });

    const list = await (
      await app.request(`/api/customers/${customer.id}/notes`, {
        headers: { cookie: member.cookie },
      })
    ).json();
    expect(list.total).toBe(2);
    expect(list.items.map((n: { body: string }) => n.body)).toEqual(['With file', 'First note']);

    const download = await app.request(withFile.attachment.url, {
      headers: { cookie: member.cookie },
    });
    expect(await download.text()).toBe('the brief');

    const refreshed = await (
      await app.request(`/api/customers/${customer.id}`, { headers: { cookie: member.cookie } })
    ).json();
    expect(refreshed.notesCount).toBe(2);
    expect((await auditRows('notes.create'))[0]!.metadata).toMatchObject({
      customerId: customer.id,
    });
  });

  it('validates the body and refuses unknown customers', async () => {
    const member = await signInAs('m@example.com', 'member');
    const customer = await createCustomer(member.cookie);
    const empty = await postNote(member.cookie, customer.id, '   ');
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.details.fieldErrors.body).toBeDefined();
    expect(
      (await postNote(member.cookie, '00000000-0000-0000-0000-000000000000', 'x')).status,
    ).toBe(404);
  });

  it('lets authors and admins edit and delete, others not; deleting removes the attachment', async () => {
    const author = await signInAs('author@example.com', 'member');
    const other = await signInAs('other@example.com', 'member');
    const viewer = await signInAs('v@example.com', 'viewer');
    const admin = await signInAs('a@example.com', 'admin');
    const customer = await createCustomer(author.cookie);
    const note = await (
      await postNote(author.cookie, customer.id, 'Mine', { name: 'a.txt', content: 'aaa' })
    ).json();

    expect(
      (
        await app.request(`/api/notes/${note.id}`, {
          ...json({ body: 'x' }, { cookie: viewer.cookie }),
          method: 'PATCH',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(`/api/notes/${note.id}`, {
          ...json({ body: 'x' }, { cookie: other.cookie }),
          method: 'PATCH',
        })
      ).status,
    ).toBe(403);
    const edited = await app.request(`/api/notes/${note.id}`, {
      ...json({ body: 'Mine, edited' }, { cookie: author.cookie }),
      method: 'PATCH',
    });
    expect(edited.status).toBe(200);
    expect((await edited.json()).body).toBe('Mine, edited');
    const byAdmin = await app.request(`/api/notes/${note.id}`, {
      ...json({ body: 'Admin edit' }, { cookie: admin.cookie }),
      method: 'PATCH',
    });
    expect(byAdmin.status).toBe(200);
    const audit = await auditRows('notes.update', note.id);
    expect(audit).toHaveLength(2);

    expect(
      (
        await app.request(`/api/notes/${note.id}`, {
          method: 'DELETE',
          headers: { cookie: other.cookie },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(`/api/notes/${note.id}`, {
          method: 'DELETE',
          headers: { cookie: author.cookie },
        })
      ).status,
    ).toBe(204);
    const list = await (
      await app.request(`/api/customers/${customer.id}/notes`, {
        headers: { cookie: author.cookie },
      })
    ).json();
    expect(list.total).toBe(0);
    expect(
      (await app.request(note.attachment.url, { headers: { cookie: author.cookie } })).status,
    ).toBe(404);
    expect(await auditRows('files.delete', note.attachment.id)).toHaveLength(1);
    expect(
      (
        await (
          await app.request(`/api/customers/${customer.id}`, { headers: { cookie: author.cookie } })
        ).json()
      ).notesCount,
    ).toBe(0);
  });

  it('viewers can read notes but not write them', async () => {
    const member = await signInAs('m@example.com', 'member');
    const viewer = await signInAs('v@example.com', 'viewer');
    const customer = await createCustomer(member.cookie);
    await postNote(member.cookie, customer.id, 'visible');
    expect(
      (
        await app.request(`/api/customers/${customer.id}/notes`, {
          headers: { cookie: viewer.cookie },
        })
      ).status,
    ).toBe(200);
    expect((await postNote(viewer.cookie, customer.id, 'nope')).status).toBe(403);
  });
});

describe('customer creation announces to Slack', () => {
  it('queues a Slack message from the follow-up job', async () => {
    const posted: SlackMessage[] = [];
    setSlackDriver({ post: async (m) => void posted.push(m) });
    try {
      const member = await signInAs('m@example.com', 'member');
      await createCustomer(member.cookie, 'Slack Co');
      const outcomes = await drainJobs();
      expect(outcomes.map((o) => o.name)).toEqual(['customers.after_create', 'notify.slack']);
      expect(posted[0]!.text).toContain('Slack Co');
    } finally {
      setSlackDriver(null);
    }
  });
});
