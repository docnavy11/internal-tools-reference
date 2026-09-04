import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/server/env';
import { requestMagicLink, verifyMagicLink } from '../../src/server/platform/auth/magic-link';
import { magicLinkTokens, users } from '../../src/server/platform/auth/table';
import { getDb, withTransaction } from '../../src/server/platform/db/client';
import { setEmailDriver, type EmailMessage } from '../../src/server/platform/notify/email';
import { drainJobs } from './helpers';

let sent: EmailMessage[];
const originalDomains = [...env.AUTH_ALLOWED_DOMAINS];

beforeEach(() => {
  sent = [];
  setEmailDriver({ send: async (m) => void sent.push(m) });
});
afterEach(() => {
  setEmailDriver(null);
  env.AUTH_ALLOWED_DOMAINS = [...originalDomains];
});

function tokenFrom(message: EmailMessage): string {
  const url = /https?:\/\/\S+/.exec(message.text)![0];
  return new URL(url).searchParams.get('token')!;
}

describe('magic link', () => {
  it('sends a single-use link that signs the person in once', async () => {
    const sentIt = await withTransaction((tx) =>
      requestMagicLink(tx, 'First@Example.com', '/settings'),
    );
    expect(sentIt).toBe(true);
    await drainJobs();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('first@example.com');
    const token = tokenFrom(sent[0]!);
    expect(token.length).toBeGreaterThan(30);

    const verified = await withTransaction((tx) => verifyMagicLink(tx, token));
    expect(verified).toEqual({ email: 'first@example.com', redirectTo: '/settings' });
    expect(await withTransaction((tx) => verifyMagicLink(tx, token))).toBeNull();
  });

  it('sends nothing to addresses that could not sign in anyway', async () => {
    await getDb().insert(users).values({ email: 'admin@company.com', role: 'admin' });
    expect(await withTransaction((tx) => requestMagicLink(tx, 'nobody@elsewhere.com', null))).toBe(
      false,
    );
    await getDb().insert(users).values({ email: 'off@company.com', status: 'disabled' });
    expect(await withTransaction((tx) => requestMagicLink(tx, 'off@company.com', null))).toBe(
      false,
    );
    expect(sent).toHaveLength(0);

    env.AUTH_ALLOWED_DOMAINS = ['company.com'];
    expect(await withTransaction((tx) => requestMagicLink(tx, 'new@company.com', null))).toBe(true);
    await drainJobs();
    expect(sent).toHaveLength(1);
  });

  it('rejects expired links', async () => {
    await withTransaction((tx) => requestMagicLink(tx, 'first@example.com', null));
    await drainJobs();
    await getDb()
      .update(magicLinkTokens)
      .set({ expiresAt: new Date(Date.now() - 1) });
    expect(await withTransaction((tx) => verifyMagicLink(tx, tokenFrom(sent[0]!)))).toBeNull();
  });
});
