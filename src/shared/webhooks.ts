import { z } from 'zod';
import { csvArray } from './query';

// Inbound webhook inbox admin API (permission jobs:manage). See docs/blocks/07-integrations.md.

export const webhookStatuses = ['pending', 'processed', 'failed'] as const;
export const webhookStatus = z.enum(webhookStatuses);

export const webhookEventSchema = z.object({
  id: z.string().uuid(),
  vendor: z.string(),
  externalId: z.string(),
  eventType: z.string().nullable(),
  status: webhookStatus,
  receivedAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
  error: z.string().nullable(),
  attempts: z.number().int(),
});
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

// GET /api/webhooks/:id adds the stored payload and headers.
export const webhookEventDetailSchema = webhookEventSchema.extend({
  payload: z.unknown(),
  headers: z.record(z.string()),
});
export type WebhookEventDetail = z.infer<typeof webhookEventDetailSchema>;

export const webhookFilters = z.object({
  vendor: z.string().max(50).optional(),
  status: csvArray(webhookStatus),
  eventType: z.string().max(100).optional(),
});
export const webhookSortColumns = ['receivedAt', 'processedAt', 'vendor', 'eventType'] as const;
