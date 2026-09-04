import { and, asc, count, desc, eq, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import type { ListParams, Page } from '../../../shared/api-types';
import type { Job } from '../../../shared/jobs';
import type { WebhookEvent, WebhookEventDetail } from '../../../shared/webhooks';
import { recordAudit, type Actor } from '../audit/record';
import { getDb, withTransaction } from '../db/client';
import { totalOf } from '../db/count';
import { notFound } from '../http/errors';
import { offset, page } from '../http/list';
import { enqueue } from '../jobs/enqueue';
import { serializeJob } from '../jobs/serialize';
import { jobs } from '../jobs/table';
import { processWebhook } from './define';
import { webhookEvents } from './table';

type Row = typeof webhookEvents.$inferSelect;

function status(row: Row): WebhookEvent['status'] {
  if (row.processedAt) return 'processed';
  return row.error ? 'failed' : 'pending';
}

export function serializeWebhookEvent(row: Row): WebhookEvent {
  return {
    id: row.id,
    vendor: row.vendor,
    externalId: row.externalId,
    eventType: row.eventType,
    status: status(row),
    receivedAt: row.receivedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    error: row.error,
    attempts: row.attempts,
  };
}

interface Filters {
  vendor?: string;
  status?: WebhookEvent['status'][];
  eventType?: string;
}

const sortColumns = {
  receivedAt: webhookEvents.receivedAt,
  processedAt: webhookEvents.processedAt,
  vendor: webhookEvents.vendor,
  eventType: webhookEvents.eventType,
};

export async function listWebhookEvents(params: ListParams & Filters): Promise<Page<WebhookEvent>> {
  const db = getDb();
  const conditions: SQL[] = [];
  if (params.vendor) conditions.push(eq(webhookEvents.vendor, params.vendor));
  if (params.eventType) conditions.push(eq(webhookEvents.eventType, params.eventType));
  if (params.status) {
    const parts: SQL[] = [];
    if (params.status.includes('processed')) parts.push(isNotNull(webhookEvents.processedAt));
    if (params.status.includes('failed'))
      parts.push(and(isNull(webhookEvents.processedAt), isNotNull(webhookEvents.error))!);
    if (params.status.includes('pending'))
      parts.push(and(isNull(webhookEvents.processedAt), isNull(webhookEvents.error))!);
    if (parts.length) conditions.push(parts.length === 1 ? parts[0]! : or(...parts)!);
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const column =
    (params.sort && sortColumns[params.sort as keyof typeof sortColumns]) ||
    webhookEvents.receivedAt;
  const direction = params.sort ? params.order : 'desc';
  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(webhookEvents)
      .where(where)
      .orderBy(direction === 'asc' ? asc(column) : desc(column), desc(webhookEvents.id))
      .limit(params.pageSize)
      .offset(offset(params)),
    db.select({ total: count() }).from(webhookEvents).where(where),
  ]);
  return page(rows.map(serializeWebhookEvent), totalOf(totalRows), params);
}

export async function getWebhookEvent(id: string): Promise<WebhookEventDetail> {
  const row = (
    await getDb().select().from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1)
  )[0];
  if (!row) throw notFound('Webhook event');
  return {
    ...serializeWebhookEvent(row),
    payload: row.payload,
    headers: row.headers as Record<string, string>,
  };
}

export async function replayWebhookEvent(actor: Actor, id: string): Promise<Job> {
  return withTransaction(async (tx) => {
    const row = (await tx.select().from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1))[0];
    if (!row) throw notFound('Webhook event');
    await tx
      .update(webhookEvents)
      .set({ processedAt: null, error: null })
      .where(eq(webhookEvents.id, id));
    const { id: jobId } = await enqueue(processWebhook, { eventId: id }, { tx });
    await recordAudit(tx, actor, {
      action: 'webhooks.replay',
      entityType: 'webhook_event',
      entityId: id,
      metadata: { vendor: row.vendor, jobId },
    });
    const job = (await tx.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0]!;
    return serializeJob(job);
  });
}
