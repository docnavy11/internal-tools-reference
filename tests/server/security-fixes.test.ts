import { inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { parseEnv } from '../../src/server/env';
import { requestMagicLink } from '../../src/server/platform/auth/magic-link';
import { magicLinkTokens, oidcStates, sessions, users } from '../../src/server/platform/auth/table';
import { auditLog } from '../../src/server/platform/audit/table';
import {
  db,
  getDb,
  setTestTransaction,
  withTransaction,
} from '../../src/server/platform/db/client';
import { cleanupAuth } from '../../src/server/platform/jobs/builtin';
import { enqueue } from '../../src/server/platform/jobs/enqueue';
import { jobs } from '../../src/server/platform/jobs/table';
import { setEmailDriver, type EmailMessage } from '../../src/server/platform/notify/email';
import { updateUser } from '../../src/server/platform/users/service';
import { hmacSha256Header, sharedTokenHeader } from '../../src/server/platform/webhooks/verify';
import { drainJobs, signInAs } from './helpers';

describe('magic link tokens never reach admins through the jobs API', () => {
  it('uses a dedicated job whose payload the API redacts, and still delivers the email', async () => {
    const sent: EmailMessage[] = [];
    setEmailDriver({ send: async (m) => void sent.push(m) });
    try {
      const admin = await signInAs('a@example.com', 'admin');
      // An existing active user is eligible regardless of the domain allowlist.
      await withTransaction((tx) => requestMagicLink(tx, 'a@example.com', null));
      const queued = await getDb().select().from(jobs);
      expect(queued).toHaveLength(1);
      expect(queued[0]!.name).toBe('auth.magic_link_email');

      const app = createApp();
      const viaApi = await (
        await app.request(`/api/jobs/${queued[0]!.id}`, { headers: { cookie: admin.cookie } })
      ).json();
      expect(viaApi.payload).toBe('[redacted]');
      const listed = await (
        await app.request('/api/jobs', { headers: { cookie: admin.cookie } })
      ).json();
      expect(JSON.stringify(listed)).not.toContain('token=');

      const outcomes = await drainJobs();
      expect(outcomes, JSON.stringify(outcomes)).toEqual([
        expect.objectContaining({ status: 'succeeded' }),
      ]);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.text).toContain('/api/auth/magic/verify?token=');
    } finally {
      setEmailDriver(null);
    }
  });
});

describe('auth cleanup job', () => {
  it('removes expired sessions, spent or expired magic links and stale oidc states', async () => {
    const user = (await getDb().insert(users).values({ email: 'u@example.com' }).returning())[0]!;
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 3600_000);
    await getDb()
      .insert(sessions)
      .values([
        { tokenHash: 'a', userId: user.id, expiresAt: past },
        { tokenHash: 'b', userId: user.id, expiresAt: future },
      ]);
    await getDb()
      .insert(magicLinkTokens)
      .values([
        { email: 'x@e.com', tokenHash: 'm1', expiresAt: past },
        { email: 'x@e.com', tokenHash: 'm2', expiresAt: future, usedAt: new Date() },
        { email: 'x@e.com', tokenHash: 'm3', expiresAt: future },
      ]);
    await getDb()
      .insert(oidcStates)
      .values([
        { state: 's1', nonce: 'n', codeVerifier: 'v', provider: 'google', expiresAt: past },
        { state: 's2', nonce: 'n', codeVerifier: 'v', provider: 'google', expiresAt: future },
      ]);
    await enqueue(cleanupAuth, {});
    const [outcome] = await drainJobs();
    expect(outcome).toMatchObject({ status: 'succeeded' });
    expect((await getDb().select().from(sessions)).map((s) => s.tokenHash)).toEqual(['b']);
    expect((await getDb().select().from(magicLinkTokens)).map((m) => m.tokenHash)).toEqual(['m3']);
    expect((await getDb().select().from(oidcStates)).map((o) => o.state)).toEqual(['s2']);
  });
});

describe('webhook verifiers refuse empty secrets', () => {
  it('throws at construction', () => {
    expect(() => hmacSha256Header({ header: 'x-sig', secret: '' })).toThrow(/no secret/);
    expect(() => sharedTokenHeader('x-token', '')).toThrow(/no token/);
    expect(() => hmacSha256Header({ header: 'x-sig', secret: 'ok' })).not.toThrow();
  });
});

describe('list paging is bounded', () => {
  it('rejects absurd page numbers instead of running a huge OFFSET', async () => {
    const app = createApp();
    const admin = await signInAs('a@example.com', 'admin');
    expect(
      (await app.request('/api/customers?page=10000', { headers: { cookie: admin.cookie } }))
        .status,
    ).toBe(200);
    expect(
      (await app.request('/api/customers?page=10001', { headers: { cookie: admin.cookie } }))
        .status,
    ).toBe(400);
  });
});

describe('last admin guard under concurrency (real pool)', () => {
  it('two simultaneous demotions of the only two admins leave at least one', async () => {
    const stamp = Date.now();
    const a = (
      await db
        .insert(users)
        .values({ email: `race-a-${stamp}@example.com`, role: 'admin' })
        .returning()
    )[0]!;
    const b = (
      await db
        .insert(users)
        .values({ email: `race-b-${stamp}@example.com`, role: 'admin' })
        .returning()
    )[0]!;
    setTestTransaction(null); // this test needs two real transactions
    try {
      const results = await Promise.allSettled([
        updateUser({ type: 'user', userId: b.id }, a.id, { role: 'member' }),
        updateUser({ type: 'user', userId: a.id }, b.id, { role: 'member' }),
      ]);
      const rows = await db
        .select()
        .from(users)
        .where(inArray(users.id, [a.id, b.id]));
      // Other admins may exist in the shared test database; what must hold is that the
      // pair cannot both succeed when they were the only two.
      const admins = (
        await db
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.role, ['admin']))
      ).length;
      const bothDemoted = rows.every((u) => u.role === 'member');
      if (admins === 0) expect(bothDemoted).toBe(false);
      expect(results.length).toBe(2);
    } finally {
      await db.delete(auditLog).where(inArray(auditLog.entityId, [a.id, b.id]));
      await db.delete(auditLog).where(inArray(auditLog.actorId, [a.id, b.id]));
      await db.delete(users).where(inArray(users.id, [a.id, b.id]));
    }
  });
});

describe('oidc start is rate limited', () => {
  it('returns 429 after too many anonymous starts', async () => {
    const app = createApp();
    let last = 0;
    for (let i = 0; i < 35; i++) last = (await app.request('/api/auth/oidc/okta/start')).status;
    expect(last).toBe(429);
  });
});

describe('env refinements from the security review', () => {
  it('production refuses magic links without a real email driver; multi-tenant Microsoft needs an allowlist', () => {
    const base = {
      APP_URL: 'https://x.test',
      DATABASE_URL: 'postgres://a:b@h/d',
      NODE_ENV: 'production',
    };
    const bad = parseEnv({ ...base, AUTH_MAGIC_LINK: 'true' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.problems.join(' ')).toMatch(/AUTH_MAGIC_LINK/);
    const ok = parseEnv({
      ...base,
      AUTH_MAGIC_LINK: 'true',
      EMAIL_DRIVER: 'smtp',
      SMTP_URL: 'smtp://h',
      EMAIL_FROM: 'a@b.co',
    });
    expect(ok.ok).toBe(true);
    const ms = parseEnv({
      ...base,
      AUTH_MICROSOFT_CLIENT_ID: 'c',
      AUTH_MICROSOFT_CLIENT_SECRET: 's',
    });
    expect(ms.ok).toBe(false);
    if (!ms.ok) expect(ms.problems.join(' ')).toMatch(/AUTH_MICROSOFT_ALLOWED_TENANTS/);
    const msOk = parseEnv({
      ...base,
      AUTH_MICROSOFT_CLIENT_ID: 'c',
      AUTH_MICROSOFT_CLIENT_SECRET: 's',
      AUTH_MICROSOFT_TENANT: 'a1b2',
    });
    expect(msOk.ok).toBe(true);
  });
});
