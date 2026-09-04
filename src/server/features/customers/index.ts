import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/http/types';
import { customerImportRoutes } from './import';
import { customerRoutes } from './routes';

// One call from src/server/features/index.ts registers everything this feature has.
// Import routes are registered first so /customers/import/* wins over /customers/:id.
export function registerCustomers(api: Hono<AppEnv>): void {
  api.route('/', customerImportRoutes());
  api.route('/', customerRoutes());
}
