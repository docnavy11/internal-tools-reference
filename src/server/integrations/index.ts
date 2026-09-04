import type { Hono } from 'hono';
import type { AppEnv } from '../platform/http/types';
import { registerExampleVendor } from './example-vendor';

// Every integration registers here with one line. See docs/recipes/add-integration.md.
export function registerIntegrations(api: Hono<AppEnv>): void {
  registerExampleVendor(api);
}
