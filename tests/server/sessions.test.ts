import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createSession,
  deleteUserSessions,
  hashToken,
  resolveSession,
} from '../../src/server/platform/auth/sessions';
import { sessions, users } from '../../src/server/platform/auth/table';
import { getDb } from '../../src/server/platform/db/client';

async function makeUser(email = 'a@example.com', status = 'active') {
  return (await getDb().insert(users).values({ email, status }).returning())[0]!;
}

describe('sessions', () => {
  it('stores only the hash and resolves the raw token', async () => {
    const user = await makeUser();
    const token = await createSession(getDb(), { userId: user.id, ip: '1.2.3.4' });
    const stored = (await getDb().select().from(sessions))[0]!;
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toContain(token);

    const resolved = await resolveSession(token);
    expect(resolved?.user.id).toBe(user.id);
    expect(await resolveSession('not-a-token')).toBeNull();
  });

  it('ignores expired sessions and disabled users', async () => {
    const user = await makeUser();
    const token = await createSession(getDb(), { userId: user.id });
    await getDb()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await resolveSession(token)).toBeNull();

    const disabled = await makeUser('d@example.com', 'disabled');
    const token2 = await createSession(getDb(), { userId: disabled.id });
    expect(await resolveSession(token2)).toBeNull();
  });

  it('slides the expiry once a day of activity has passed', async () => {
    const user = await makeUser();
    const token = await createSession(getDb(), { userId: user.id });
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    await getDb()
      .update(sessions)
      .set({ lastSeenAt: twoDaysAgo, expiresAt: new Date(Date.now() + 1000) });
    await resolveSession(token);
    const after = (await getDb().select().from(sessions))[0]!;
    expect(after.expiresAt.getTime()).toBeGreaterThan(Date.now() + 20 * 24 * 3600 * 1000);
  });

  it('revokes all sessions of a user', async () => {
    const user = await makeUser();
    await createSession(getDb(), { userId: user.id });
    await createSession(getDb(), { userId: user.id });
    expect(await deleteUserSessions(getDb(), user.id)).toBe(2);
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(
      0,
    );
  });
});
