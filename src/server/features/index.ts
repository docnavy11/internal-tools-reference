import type { Hono } from 'hono';
import type { AppEnv } from '../platform/http/types';
import { registerCustomers } from './customers';
// Side-effect imports register job handlers and schedules for both web and worker
// processes. A new feature with jobs adds its jobs.ts here.
import './customers/jobs';

// Every feature registers here with one line. See docs/recipes/add-entity.md.
export function registerFeatures(api: Hono<AppEnv>): void {
  registerCustomers(api);
}
