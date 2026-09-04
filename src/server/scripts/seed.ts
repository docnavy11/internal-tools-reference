// npm run db:seed
import { closeDatabase } from '../platform/db/client';
import { seed } from '../platform/db/seed';
import { logger } from '../platform/http/logger';

seed()
  .then(() => closeDatabase())
  .catch((err) => {
    logger.error({ err }, 'seed failed');
    process.exit(1);
  });
