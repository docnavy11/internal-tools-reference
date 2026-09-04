import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { diskDriver } from '../../src/server/platform/storage/disk';
import {
  setStorageDriver,
  storeFile,
  purgeTrashedFiles,
  softDeleteFile,
} from '../../src/server/platform/storage/service';
import { isInlineType, sniffContentType } from '../../src/server/platform/storage/sniff';
import { files } from '../../src/server/platform/storage/table';
import { getDb, withTransaction } from '../../src/server/platform/db/client';
import { auditRows, signInAs } from './helpers';
import { env } from '../../src/server/env';
import { eq } from 'drizzle-orm';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'itr-files-'));
  setStorageDriver(diskDriver(dir));
});
afterAll(async () => {
  setStorageDriver(null);
  await rm(dir, { recursive: true, force: true });
});

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
]);

describe('content sniffing', () => {
  it('recognises common types from bytes and never trusts the filename alone', () => {
    expect(sniffContentType(PNG, 'evil.exe')).toBe('image/png');
    expect(sniffContentType(Buffer.from('%PDF-1.7\n'), 'x.bin')).toBe('application/pdf');
    expect(sniffContentType(Buffer.from('a,b,c\n1,2,3\n'), 'data.csv')).toBe('text/csv');
    expect(sniffContentType(Buffer.from('hello'), 'notes.md')).toBe('text/markdown');
    expect(sniffContentType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), 'report.xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(sniffContentType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), 'archive.zip')).toBe(
      'application/zip',
    );
    expect(sniffContentType(Buffer.from([0, 1, 2, 3, 0xff, 0xfe]), 'blob.dat')).toBe(
      'application/octet-stream',
    );
    expect(sniffContentType(Buffer.from('<script>alert(1)</script>'), 'page.html')).toBe(
      'text/plain',
    );
    expect(isInlineType('image/png')).toBe(true);
    expect(isInlineType('text/plain')).toBe(false);
  });
});

describe('file storage', () => {
  it('stores bytes and metadata, hashes content, audits, enforces size limit', async () => {
    const user = await signInAs('u@example.com', 'member');
    const actor = { type: 'user' as const, userId: user.user.id };
    const record = await withTransaction((tx) =>
      storeFile(tx, actor, {
        filename: 'dir/../pic.png',
        bytes: PNG,
        entityType: 'customer',
        entityId: user.user.id,
      }),
    );
    expect(record).toMatchObject({
      filename: 'dir_.._pic.png',
      contentType: 'image/png',
      sizeBytes: PNG.length,
      entityType: 'customer',
    });
    expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.uploadedBy?.email).toBe('u@example.com');
    expect(record.url).toBe(`/api/files/${record.id}`);
    expect(await auditRows('files.upload', record.id)).toHaveLength(1);

    const max = env.UPLOAD_MAX_BYTES;
    env.UPLOAD_MAX_BYTES = 10;
    try {
      await expect(
        withTransaction((tx) =>
          storeFile(tx, actor, {
            filename: 'big.txt',
            bytes: Buffer.alloc(11, 'a'),
            entityType: null,
            entityId: null,
          }),
        ),
      ).rejects.toMatchObject({
        code: 'validation_error',
      });
      await expect(
        withTransaction((tx) =>
          storeFile(tx, actor, {
            filename: 'empty.txt',
            bytes: Buffer.alloc(0),
            entityType: null,
            entityId: null,
          }),
        ),
      ).rejects.toMatchObject({
        code: 'validation_error',
      });
    } finally {
      env.UPLOAD_MAX_BYTES = max;
    }
  });

  it('serves downloads by entity permission with the right disposition', async () => {
    const app = createApp();
    const member = await signInAs('m@example.com', 'member');
    const viewer = await signInAs('v@example.com', 'viewer');
    const admin = await signInAs('a@example.com', 'admin');
    const actor = { type: 'user' as const, userId: member.user.id };
    const image = await withTransaction((tx) =>
      storeFile(tx, actor, {
        filename: 'p.png',
        bytes: PNG,
        entityType: 'note',
        entityId: member.user.id,
      }),
    );
    const text = await withTransaction((tx) =>
      storeFile(tx, actor, {
        filename: 'r "q".csv',
        bytes: Buffer.from('a,b\n'),
        entityType: 'note',
        entityId: member.user.id,
      }),
    );
    const orphan = await withTransaction((tx) =>
      storeFile(tx, actor, {
        filename: 'o.txt',
        bytes: Buffer.from('x'),
        entityType: null,
        entityId: null,
      }),
    );

    const res = await app.request(image.url, { headers: { cookie: viewer.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-disposition')).toMatch(/^inline; filename="p.png"/);
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);

    const csv = await app.request(text.url, { headers: { cookie: viewer.cookie } });
    expect(csv.headers.get('content-disposition')).toMatch(/^attachment; filename="r _q_.csv"/);
    expect(await csv.text()).toBe('a,b\n');

    expect((await app.request(image.url)).status).toBe(401);
    expect((await app.request(orphan.url, { headers: { cookie: member.cookie } })).status).toBe(
      403,
    );
    expect((await app.request(orphan.url, { headers: { cookie: admin.cookie } })).status).toBe(200);
    expect(
      (
        await app.request('/api/files/00000000-0000-0000-0000-000000000000', {
          headers: { cookie: admin.cookie },
        })
      ).status,
    ).toBe(404);
  });

  it('soft deletes hide the file and the trash job removes the bytes', async () => {
    const user = await signInAs('u@example.com', 'admin');
    const actor = { type: 'user' as const, userId: user.user.id };
    const record = await withTransaction((tx) =>
      storeFile(tx, actor, {
        filename: 't.txt',
        bytes: Buffer.from('bye'),
        entityType: null,
        entityId: null,
      }),
    );
    await withTransaction((tx) => softDeleteFile(tx, actor, record.id));
    const app = createApp();
    expect((await app.request(record.url, { headers: { cookie: user.cookie } })).status).toBe(404);

    expect(await purgeTrashedFiles(30, { type: 'system' })).toBe(0);
    await getDb()
      .update(files)
      .set({ deletedAt: new Date(Date.now() - 40 * 24 * 3600_000) })
      .where(eq(files.id, record.id));
    expect(await purgeTrashedFiles(30, { type: 'system' })).toBe(1);
    expect(await getDb().select().from(files).where(eq(files.id, record.id))).toHaveLength(0);
    expect(await auditRows('files.purge', record.id)).toHaveLength(1);
  });
});
