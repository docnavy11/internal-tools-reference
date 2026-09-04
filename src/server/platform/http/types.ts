import type { Logger } from './logger';

// Variables every route handler can read from the Hono context.
export type AppEnv = {
  Variables: {
    requestId: string;
    log: Logger;
  };
};
