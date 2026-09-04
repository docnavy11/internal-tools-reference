import type { Hono } from 'hono';
import type { AppEnv } from '../platform/http/types';
import { registerCustomers } from './customers';

// Every feature registers here with one line. See docs/recipes/add-entity.md.
export function registerFeatures(api: Hono<AppEnv>): void {
  registerCustomers(api);
}
