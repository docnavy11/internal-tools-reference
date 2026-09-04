import type { Hono } from 'hono';
import { z } from 'zod';
import type { Actor } from '../audit/record';
import { getDb, withTransaction, type Tx } from '../db/client';
import { AppError } from '../http/errors';
import { rateLimit } from '../http/rate-limit';
import type { AppEnv } from '../http/types';
import { publicRoute } from '../auth/middleware';
import { defineJob, NonRetryableError } from '../jobs/define';
import { enqueue } from '../jobs/enqueue';
import { logger } from '../http/logger';
import { eq } from 'drizzle-orm';
import { webhookEvents } from './table';
import type { Verifier } from './verify';

export interface WebhookEventRow {
  id: string;
  vendor: string;
  externalId: string;
  eventType: string | null;
  payload: unknown;
  headers: Record<string, string>;
}

export interface WebhookDefinition {
  vendor: string; // path segment: POST /api/webhooks/<vendor>
  verify: Verifier;
  externalId: (payload: unknown, headers: Headers) => string | undefined;
  eventType: (payload: unknown, headers: Headers) => string | undefined;
  // Does the real work, in a transaction, with a job actor for audit rows.
  handle: (event: WebhookEventRow, ctx: { tx: Tx; actor: Actor }) => Promise<void>;
}

const registry = new Map<string, WebhookDefinition>();

export function defineWebhook(def: WebhookDefinition): WebhookDefinition {
  registry.set(def.vendor, def);
  return def;
}

export function listWebhookVendors(): string[] {
  return [...registry.keys()].sort();
}

const KEPT_HEADERS = ['content-type', 'user-agent', 'x-request-id'];

function keptHeaders(headers: Headers, def: WebhookDefinition): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const v = headers.get(name);
    if (v) out[name] = v;
  }
  // Vendor-specific headers (signatures, timestamps, event ids) start with x- in practice.
  headers.forEach((value, key) => {
    if (key.startsWith('x-') && !key.startsWith('x-forwarded')) out[key] = value;
  });
  void def;
  return out;
}

// Processing job: dispatches an inbox row to its vendor handler. The handler runs in its
// own transaction; the outcome (processed, or error + attempts) is recorded outside it so
// a failed handler still leaves a trace on the row before the job retries.
export const processWebhook = defineJob(
  'webhooks.process',
  z.object({ eventId: z.string().uuid() }),
  async ({ eventId }, ctx) => {
    const db = getDb();
    const row = (
      await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId)).limit(1)
    )[0];
    if (!row) throw new NonRetryableError(`webhook event ${eventId} not found`);
    const def = registry.get(row.vendor);
    if (!def)
      throw new NonRetryableError(`no webhook handler registered for vendor "${row.vendor}"`);
    const event: WebhookEventRow = {
      id: row.id,
      vendor: row.vendor,
      externalId: row.externalId,
      eventType: row.eventType,
      payload: row.payload,
      headers: row.headers as Record<string, string>,
    };
    try {
      await withTransaction((tx) => def.handle(event, { tx, actor: ctx.actor }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(webhookEvents)
        .set({ error: message, attempts: row.attempts + 1 })
        .where(eq(webhookEvents.id, eventId));
      throw err;
    }
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date(), error: null, attempts: row.attempts + 1 })
      .where(eq(webhookEvents.id, eventId));
    return { eventId, vendor: row.vendor };
  },
  { maxAttempts: 5, timeoutMs: 60_000 },
);

// Mounts POST /api/webhooks/<vendor>. Verify, store, acknowledge; the job does the rest.
export function registerWebhook(api: Hono<AppEnv>, def: WebhookDefinition): void {
  defineWebhook(def);
  api.post(
    `/webhooks/${def.vendor}`,
    publicRoute(),
    rateLimit({ limit: 600, windowMs: 60_000 }),
    async (c) => {
      const raw = await c.req.text();
      if (!def.verify(raw, c.req.raw.headers)) {
        logger.warn({ vendor: def.vendor }, 'webhook signature rejected');
        throw new AppError('invalid_signature', 401, 'Webhook signature could not be verified');
      }
      let payload: unknown;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        throw new AppError('bad_request', 400, 'Webhook body is not JSON');
      }
      const externalId =
        def.externalId(payload, c.req.raw.headers) ?? `sha256:${await sha256(raw)}`;
      const eventType = def.eventType(payload, c.req.raw.headers) ?? null;
      const inserted = await withTransaction(async (tx) => {
        const rows = await tx
          .insert(webhookEvents)
          .values({
            vendor: def.vendor,
            externalId,
            eventType,
            payload: payload as object,
            headers: keptHeaders(c.req.raw.headers, def),
          })
          .onConflictDoNothing({ target: [webhookEvents.vendor, webhookEvents.externalId] })
          .returning({ id: webhookEvents.id });
        const row = rows[0];
        if (row) await enqueue(processWebhook, { eventId: row.id }, { tx });
        return row;
      });
      if (!inserted) {
        c.get('log').info(
          { vendor: def.vendor, externalId },
          'duplicate webhook delivery acknowledged',
        );
        return c.json({ ok: true, duplicate: true });
      }
      return c.json({ ok: true, id: inserted.id });
    },
  );
}

async function sha256(text: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text).digest('hex');
}
