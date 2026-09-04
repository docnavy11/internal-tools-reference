import type { Hono } from 'hono';
import { env } from '../../env';
import type { AppEnv } from '../../platform/http/types';
import { registerWebhook } from '../../platform/webhooks/define';
import { exampleVendorWebhook } from './webhook';

// Enabled only when configured. Registers the inbound webhook; the outbound client is
// imported by whoever needs it (jobs, services).
export function registerExampleVendor(api: Hono<AppEnv>): void {
  if (!env.EXAMPLE_VENDOR_API_KEY) return;
  registerWebhook(api, exampleVendorWebhook());
}
