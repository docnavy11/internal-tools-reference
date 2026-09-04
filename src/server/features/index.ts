import type { Hono } from 'hono';
import type { AppEnv } from '../platform/http/types';

// Every feature registers here with one line. See docs/recipes/add-entity.md.
export function registerFeatures(_app: Hono<AppEnv>): void {
  // registerCustomers(app);
}
