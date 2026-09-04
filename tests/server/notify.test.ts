import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { notify } from '../../src/server/platform/notify';
import { setEmailDriver, type EmailMessage } from '../../src/server/platform/notify/email';
import { setSlackDriver, type SlackMessage } from '../../src/server/platform/notify/slack';
import { NonRetryableError } from '../../src/server/platform/jobs/define';
import { jobs } from '../../src/server/platform/jobs/table';
import { getDb } from '../../src/server/platform/db/client';
import { drainJobs } from './helpers';

let emails: EmailMessage[];
let slacks: SlackMessage[];
beforeEach(() => {
  emails = [];
  slacks = [];
  setEmailDriver({ send: async (m) => void emails.push(m) });
  setSlackDriver({ post: async (m) => void slacks.push(m) });
});
afterEach(() => {
  setEmailDriver(null);
  setSlackDriver(null);
});

describe('notifications', () => {
  it('are queued as jobs and delivered by the worker', async () => {
    await notify.email({ to: 'a@example.com', subject: 'Hi', text: 'Hello' });
    await notify.slack({ text: 'ping' });
    expect(emails).toHaveLength(0);
    const outcomes = await drainJobs();
    expect(outcomes.map((o) => `${o.name}:${o.status}`).sort()).toEqual([
      'notify.email:succeeded',
      'notify.slack:succeeded',
    ]);
    expect(emails[0]).toMatchObject({ to: 'a@example.com', subject: 'Hi' });
    expect(slacks[0]).toMatchObject({ text: 'ping' });
  });

  it('retries transient Slack failures and gives up on permanent ones', async () => {
    setSlackDriver({
      post: async () => {
        throw new NonRetryableError('slack: channel_not_found');
      },
    });
    const { id } = await notify.slack({ text: 'x', channel: 'nope' });
    const [outcome] = await drainJobs();
    expect(outcome).toMatchObject({ status: 'dead' });
    expect((await getDb().select().from(jobs).where(eq(jobs.id, id)))[0]!.lastError).toContain(
      'channel_not_found',
    );

    setSlackDriver({
      post: async () => {
        throw new Error('slack: ratelimited');
      },
    });
    const second = await notify.slack({ text: 'y' });
    const [again] = await drainJobs();
    expect(again).toMatchObject({ status: 'failed' });
    expect((await getDb().select().from(jobs).where(eq(jobs.id, second.id)))[0]!.status).toBe(
      'pending',
    );
  });

  it('rejects malformed messages before queueing', async () => {
    await expect(notify.email({ to: 'not-an-email', subject: 'x', text: 'y' })).rejects.toThrow();
  });
});
