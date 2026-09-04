// npm run db:migrate
import { closeDatabase } from '../platform/db/client';
import { runMigrations } from '../platform/db/migrate';
import { logger } from '../platform/http/logger';

runMigrations()
  .then(() => closeDatabase())
  .catch((err) => {
    logger.error({ err }, 'migration failed');
    process.exit(1);
  });
