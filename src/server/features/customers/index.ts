import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/http/types';
import { customerRoutes } from './routes';

// One call from src/server/features/index.ts registers everything this feature has.
export function registerCustomers(api: Hono<AppEnv>): void {
  api.route('/', customerRoutes());
}
