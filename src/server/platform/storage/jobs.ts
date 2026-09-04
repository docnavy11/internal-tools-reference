import { z } from 'zod';
import { env } from '../../env';
import { defineJob, defineSchedule } from '../jobs/define';
import { purgeTrashedFiles } from './service';

// Bytes of soft-deleted files are removed after FILES_TRASH_DAYS.
export const purgeFiles = defineJob(
  'files.purge_trash',
  z.object({ olderThanDays: z.number().int().min(1).optional() }),
  async ({ olderThanDays }, ctx) => {
    const purged = await purgeTrashedFiles(olderThanDays ?? env.FILES_TRASH_DAYS, ctx.actor);
    ctx.log.info({ purged }, 'purged trashed files');
    return { purged };
  },
  { maxAttempts: 3, timeoutMs: 10 * 60_000 },
);
defineSchedule('files.purge_trash.daily', '45 2 * * *', purgeFiles, {});
