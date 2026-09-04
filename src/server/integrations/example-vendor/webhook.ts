import { z } from 'zod';
import { env } from '../../env';
import { recordAudit } from '../../platform/audit/record';
import { hmacSha256Header } from '../../platform/webhooks/verify';
import type { WebhookDefinition } from '../../platform/webhooks/define';

// Inbound side. The vendor signs `${timestamp}.${body}` with HMAC-SHA256 and sends
// `x-example-signature: sha256=<hex>` and `x-example-timestamp: <unix seconds>`.
const eventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.record(z.unknown()).default({}),
});

export function exampleVendorWebhook(): WebhookDefinition {
  return {
    vendor: 'example-vendor',
    verify: hmacSha256Header({
      header: 'x-example-signature',
      prefix: 'sha256=',
      secret: env.EXAMPLE_VENDOR_WEBHOOK_SECRET ?? '',
      timestampHeader: 'x-example-timestamp',
      toleranceSeconds: 300,
    }),
    externalId: (payload) => (payload as { id?: string })?.id,
    eventType: (payload) => (payload as { type?: string })?.type,
    async handle(event, { tx, actor }) {
      const parsed = eventSchema.parse(event.payload);
      // A real handler updates records. The example records what arrived so the pattern
      // (transaction, job actor, audit trail) is visible end to end.
      if (parsed.type === 'widget.failing') throw new Error('simulated handler failure');
      await recordAudit(tx, actor, {
        action: 'example_vendor.event',
        entityType: 'webhook_event',
        entityId: event.id,
        after: { type: parsed.type, data: parsed.data },
        metadata: { vendor: 'example-vendor', externalId: parsed.id },
      });
    },
  };
}
