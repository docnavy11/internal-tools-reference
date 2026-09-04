import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/http/types';
import { noteRoutes } from './routes';

export function registerNotes(api: Hono<AppEnv>): void {
  api.route('/', noteRoutes());
}
