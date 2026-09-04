import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ListParams, Page } from '../../../shared/api-types';
import type { Note, NoteInput } from '../../../shared/features/notes/schema';
import { recordAudit, type Actor } from '../../platform/audit/record';
import { users } from '../../platform/auth/table';
import { getDb, withTransaction, type DbOrTx } from '../../platform/db/client';
import { totalOf } from '../../platform/db/count';
import { AppError, forbidden, notFound } from '../../platform/http/errors';
import { offset, page } from '../../platform/http/list';
import { serializeFile, softDeleteFile, storeFile } from '../../platform/storage/service';
import { files } from '../../platform/storage/table';
import { customers } from '../customers/table';
import { notes } from './table';

const uploaders = alias(users, 'uploaders');

function baseQuery(db: DbOrTx) {
  return db
    .select({
      note: notes,
      author: { id: users.id, name: users.name, email: users.email },
      file: files,
      uploader: { id: uploaders.id, name: uploaders.name, email: uploaders.email },
    })
    .from(notes)
    .leftJoin(users, eq(users.id, notes.createdBy))
    .leftJoin(files, and(eq(files.id, notes.attachmentId), isNull(files.deletedAt)))
    .leftJoin(uploaders, eq(uploaders.id, files.uploadedBy));
}

type Row = Awaited<ReturnType<ReturnType<typeof baseQuery>['execute']>>[number];

function serialize(r: Row): Note {
  return {
    id: r.note.id,
    customerId: r.note.customerId,
    body: r.note.body,
    author: r.author?.id ? { id: r.author.id, name: r.author.name, email: r.author.email } : null,
    attachment: r.file ? serializeFile(r.file, r.uploader?.id ? r.uploader : null) : null,
    createdAt: r.note.createdAt.toISOString(),
    updatedAt: r.note.updatedAt?.toISOString() ?? null,
  };
}

async function ensureCustomer(db: DbOrTx, customerId: string): Promise<void> {
  const row = (
    await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1)
  )[0];
  if (!row) throw notFound('Customer');
}

export async function listNotes(customerId: string, params: ListParams): Promise<Page<Note>> {
  const db = getDb();
  await ensureCustomer(db, customerId);
  const where = and(eq(notes.customerId, customerId), isNull(notes.deletedAt));
  const [rows, totalRows] = await Promise.all([
    baseQuery(db)
      .where(where)
      .orderBy(desc(notes.createdAt), desc(notes.id))
      .limit(params.pageSize)
      .offset(offset(params)),
    db.select({ total: count() }).from(notes).where(where),
  ]);
  return page(rows.map(serialize), totalOf(totalRows), params);
}

async function loadOne(db: DbOrTx, id: string): Promise<Note> {
  const row = (
    await baseQuery(db)
      .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
      .limit(1)
  )[0];
  if (!row) throw notFound('Note');
  return serialize(row);
}

export interface CreateNoteInput extends NoteInput {
  attachment?: { filename: string; bytes: Buffer } | null;
}

export async function createNote(
  actor: Actor,
  customerId: string,
  input: CreateNoteInput,
): Promise<Note> {
  return withTransaction(async (tx) => {
    await ensureCustomer(tx, customerId);
    const actorId = actor.type === 'user' ? actor.userId : null;
    // Application time, not the column default: Postgres now() is the transaction start,
    // so notes created in one transaction (tests) would tie and list in random order.
    const inserted = (
      await tx
        .insert(notes)
        .values({
          customerId,
          body: input.body,
          createdBy: actorId,
          updatedBy: actorId,
          createdAt: new Date(),
        })
        .returning({ id: notes.id })
    )[0]!;
    if (input.attachment) {
      const file = await storeFile(tx, actor, {
        ...input.attachment,
        entityType: 'note',
        entityId: inserted.id,
      });
      await tx.update(notes).set({ attachmentId: file.id }).where(eq(notes.id, inserted.id));
    }
    const after = await loadOne(tx, inserted.id);
    await recordAudit(tx, actor, {
      action: 'notes.create',
      entityType: 'note',
      entityId: after.id,
      after,
      metadata: { customerId },
    });
    return after;
  });
}

// Authors edit and delete their own notes; admins any. Everyone else is refused.
function assertMayChange(actor: Actor, note: Note, role: string): void {
  if (actor.type !== 'user') return;
  if (role === 'admin') return;
  if (note.author?.id === actor.userId) return;
  throw forbidden();
}

export async function updateNote(
  actor: Actor,
  role: string,
  id: string,
  input: NoteInput,
): Promise<Note> {
  return withTransaction(async (tx) => {
    const before = await loadOne(tx, id);
    assertMayChange(actor, before, role);
    await tx
      .update(notes)
      .set({
        body: input.body,
        updatedAt: new Date(),
        updatedBy: actor.type === 'user' ? actor.userId : null,
      })
      .where(eq(notes.id, id));
    const after = await loadOne(tx, id);
    await recordAudit(tx, actor, {
      action: 'notes.update',
      entityType: 'note',
      entityId: id,
      before,
      after,
      metadata: { customerId: after.customerId },
    });
    return after;
  });
}

export async function deleteNote(actor: Actor, role: string, id: string): Promise<void> {
  await withTransaction(async (tx) => {
    const before = await loadOne(tx, id);
    assertMayChange(actor, before, role);
    const now = new Date();
    await tx
      .update(notes)
      .set({
        deletedAt: now,
        updatedAt: now,
        updatedBy: actor.type === 'user' ? actor.userId : null,
      })
      .where(eq(notes.id, id));
    if (before.attachment) await softDeleteFile(tx, actor, before.attachment.id);
    await recordAudit(tx, actor, {
      action: 'notes.delete',
      entityType: 'note',
      entityId: id,
      before,
      metadata: { customerId: before.customerId },
    });
  });
}

export { AppError };
