import { z } from 'zod';
import type { DbOrTx } from '../db/client';
import { defineJob } from '../jobs/define';
import { enqueue } from '../jobs/enqueue';
import { deliverEmail, type EmailMessage } from './email';
import { deliverSlack, type SlackMessage } from './slack';

// Application code calls notify.email() / notify.slack(). Both enqueue a job so no request
// ever waits on a mail server or on Slack, and failures retry through the jobs system.

const emailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(998),
  text: z.string().min(1),
  html: z.string().optional(),
});

export const emailJob = defineJob(
  'notify.email',
  emailSchema,
  async (message) => {
    await deliverEmail(message);
    return { to: message.to };
  },
  { maxAttempts: 5, timeoutMs: 30_000 },
);

const slackSchema = z.object({
  channel: z.string().min(1).optional(),
  text: z.string().min(1).max(40_000),
  blocks: z.array(z.unknown()).optional(),
});

export const slackJob = defineJob(
  'notify.slack',
  slackSchema,
  async (message) => {
    await deliverSlack(message);
    return { channel: message.channel ?? null };
  },
  { maxAttempts: 5, timeoutMs: 30_000 },
);

export const notify = {
  email(message: EmailMessage, opts: { tx?: DbOrTx } = {}) {
    return enqueue(emailJob, message, { tx: opts.tx });
  },
  slack(message: SlackMessage, opts: { tx?: DbOrTx } = {}) {
    return enqueue(slackJob, message, { tx: opts.tx });
  },
};
