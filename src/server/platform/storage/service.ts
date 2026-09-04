import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { and, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import { env } from '../../env';
import type { FileRecord } from '../../../shared/files';
import type { Actor } from '../audit/record';
import { recordAudit } from '../audit/record';
import { users } from '../auth/table';
import { getDb, withTransaction, type DbOrTx } from '../db/client';
import { AppError, notFound } from '../http/errors';
import { diskDriver } from './disk';
import type { StorageDriver } from './driver';
import { s3Driver } from './s3';
import { sniffContentType } from './sniff';
import { files } from './table';

function selectDriver(): StorageDriver {
  if (env.STORAGE_DRIVER === 's3') {
    return s3Driver({
      bucket: env.S3_BUCKET!,
      region: env.S3_REGION!,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }
  return diskDriver(env.FILES_DIR);
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  driver ??= selectDriver();
  return driver;
}
// Tests may swap the driver (for example to a temp directory).
export function setStorageDriver(next: StorageDriver | null): void {
  driver = next;
}

type Row = typeof files.$inferSelect;
type Uploader = Pick<typeof users.$inferSelect, 'id' | 'name' | 'email'> | null;

export function serializeFile(row: Row, uploader: Uploader): FileRecord {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    uploadedBy: uploader ? { id: uploader.id, name: uploader.name, email: uploader.email } : null,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.createdAt.toISOString(),
    url: `/api/files/${row.id}`,
  };
}

export interface StoreFileInput {
  filename: string;
  bytes: Buffer;
  entityType: string | null;
  entityId: string | null;
}

// Validates size, sniffs the type, writes the bytes, inserts the row. Call inside the
// transaction that creates the owning record so the two commit together.
export async function storeFile(
  tx: DbOrTx,
  actor: Actor,
  input: StoreFileInput,
): Promise<FileRecord> {
  if (input.bytes.length === 0)
    throw new AppError('validation_error', 400, 'Invalid request', {
      formErrors: [],
      fieldErrors: { file: ['The file is empty'] },
    });
  if (input.bytes.length > env.UPLOAD_MAX_BYTES) {
    throw new AppError('validation_error', 400, 'Invalid request', {
      formErrors: [],
      fieldErrors: {
        file: [`The file is larger than ${Math.round(env.UPLOAD_MAX_BYTES / 1024 / 1024)} MB`],
      },
    });
  }
  const filename = input.filename.replace(/[\\/]/g, '_').slice(0, 255) || 'file';
  const contentType = sniffContentType(input.bytes, filename);
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}`;
  await storage().put(key, input.bytes, contentType);
  const inserted = (
    await tx
      .insert(files)
      .values({
        storageKey: key,
        filename,
        contentType,
        sizeBytes: input.bytes.length,
        sha256: createHash('sha256').update(input.bytes).digest('hex'),
        uploadedBy: actor.type === 'user' ? actor.userId : null,
        entityType: input.entityType,
        entityId: input.entityId,
      })
      .returning()
  )[0]!;
  const uploader =
    actor.type === 'user'
      ? ((
          await tx
            .select({ id: users.id, name: users.name, email: users.email })
            .from(users)
            .where(eq(users.id, actor.userId))
        )[0] ?? null)
      : null;
  const record = serializeFile(inserted, uploader);
  await recordAudit(tx, actor, {
    action: 'files.upload',
    entityType: 'file',
    entityId: inserted.id,
    after: record,
  });
  return record;
}

export async function getFileRecord(
  id: string,
  db: DbOrTx = getDb(),
): Promise<{ record: FileRecord; row: Row }> {
  const rows = await db
    .select({ file: files, uploader: { id: users.id, name: users.name, email: users.email } })
    .from(files)
    .leftJoin(users, eq(users.id, files.uploadedBy))
    .where(and(eq(files.id, id), isNull(files.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('File');
  return { record: serializeFile(row.file, row.uploader), row: row.file };
}

export async function openFile(row: Row): Promise<Readable> {
  return storage().get(row.storageKey);
}

export async function listFilesFor(
  entityType: string,
  entityId: string,
  db: DbOrTx = getDb(),
): Promise<FileRecord[]> {
  const rows = await db
    .select({ file: files, uploader: { id: users.id, name: users.name, email: users.email } })
    .from(files)
    .leftJoin(users, eq(users.id, files.uploadedBy))
    .where(
      and(eq(files.entityType, entityType), eq(files.entityId, entityId), isNull(files.deletedAt)),
    )
    .orderBy(files.createdAt);
  return rows.map((r) => serializeFile(r.file, r.uploader));
}

// Soft delete: the row is hidden at once, the bytes go with the trash job later.
export async function softDeleteFile(tx: DbOrTx, actor: Actor, id: string): Promise<void> {
  const { record } = await getFileRecord(id, tx);
  await tx.update(files).set({ deletedAt: new Date() }).where(eq(files.id, id));
  await recordAudit(tx, actor, {
    action: 'files.delete',
    entityType: 'file',
    entityId: id,
    before: record,
  });
}

// Hard delete of bytes and rows for files soft-deleted longer ago than the threshold.
export async function purgeTrashedFiles(olderThanDays: number, actor: Actor): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 3600 * 1000);
  const rows = await getDb()
    .select()
    .from(files)
    .where(and(isNotNull(files.deletedAt), lt(files.deletedAt, cutoff)));
  for (const row of rows) {
    await storage().delete(row.storageKey);
    await withTransaction(async (tx) => {
      await tx.delete(files).where(eq(files.id, row.id));
      await recordAudit(tx, actor, {
        action: 'files.purge',
        entityType: 'file',
        entityId: row.id,
        metadata: { storageKey: row.storageKey, olderThanDays },
      });
    });
  }
  return rows.length;
}
