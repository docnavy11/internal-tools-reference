import type { Actor } from '../audit/record';
import type { ResolvedSession } from '../auth/sessions';
import type { Logger } from './logger';

// Variables every route handler can read from the Hono context.
export type AppEnv = {
  Variables: {
    requestId: string;
    log: Logger;
    session: ResolvedSession | null;
    actor: Actor;
  };
};
