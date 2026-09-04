import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { env } from '../../src/server/env';
import { setEmailDriver, type EmailMessage } from '../../src/server/platform/notify/email';
import { cookieFrom, drainJobs, expectAudited, json, signInAs } from './helpers';

const app = createApp();
const origin = new URL(env.APP_URL).origin;

describe('auth routes', () => {
  it('lists configured sign-in methods', async () => {
    const res = await app.request('/api/auth/providers');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ devLogin: true });
    expect(Array.isArray(body.oidc)).toBe(true);
  });

  it('requires a session for /api/me and returns the error envelope', async () => {
    const res = await app.request('/api/me');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.requestId).toBeTruthy();
  });

  it('dev login: first user is admin, later users get the default role', async () => {
    const first = await app.request('/api/auth/dev', json({ email: 'Admin@Local.test' }));
    expect(first.status).toBe(200);
    const setCookie = first.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/^sid=/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const me = await app.request('/api/me', { headers: { cookie: cookieFrom(first) } });
    const body = await me.json();
    expect(body.user).toMatchObject({ email: 'admin@local.test', role: 'admin' });
    expect(body.permissions).toContain('users:manage');
    await expectAudited('users.dev_login_create', body.user.id);

    const second = await app.request('/api/auth/dev', json({ email: 'someone@local.test' }));
    const me2 = await (
      await app.request('/api/me', { headers: { cookie: cookieFrom(second) } })
    ).json();
    expect(me2.user.role).toBe(env.AUTH_DEFAULT_ROLE);
    expect(me2.permissions).not.toContain('users:manage');
  });

  it('returns validation errors in the envelope with field errors', async () => {
    const res = await app.request('/api/auth/dev', json({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details.fieldErrors.email).toBeDefined();
    expect(body.error.requestId).toBeTruthy();
  });

  it('rejects cross-origin state-changing requests', async () => {
    const evil = await app.request(
      '/api/auth/dev',
      json({ email: 'a@b.co' }, { origin: 'https://evil.test' }),
    );
    expect(evil.status).toBe(403);
    expect((await evil.json()).error.code).toBe('csrf');

    const crossSite = await app.request(
      '/api/auth/dev',
      json({ email: 'a@b.co' }, { 'sec-fetch-site': 'cross-site' }),
    );
    expect(crossSite.status).toBe(403);

    const ok = await app.request(
      '/api/auth/dev',
      json({ email: 'a@b.co' }, { origin, 'sec-fetch-site': 'same-origin' }),
    );
    expect(ok.status).toBe(200);
  });

  it('logout deletes the session', async () => {
    const { cookie } = await signInAs('x@example.com', 'member');
    const out = await app.request('/api/auth/logout', { method: 'POST', headers: { cookie } });
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toMatch(/sid=;|Max-Age=0/);
    expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(401);
  });

  it('redirects unknown OIDC providers back to login with an error', async () => {
    const res = await app.request('/api/auth/oidc/okta/start?redirect_to=/x');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?error=unknown_provider&redirect_to=%2Fx');
  });
});

describe('magic link routes', () => {
  let sent: EmailMessage[];
  const magicWas = env.AUTH_MAGIC_LINK;
  beforeEach(() => {
    sent = [];
    setEmailDriver({ send: async (m) => void sent.push(m) });
    env.AUTH_MAGIC_LINK = true;
  });
  afterEach(() => {
    setEmailDriver(null);
    env.AUTH_MAGIC_LINK = magicWas;
  });

  it('always answers 200 and signs in through the emailed link', async () => {
    const res = await app.request(
      '/api/auth/magic/request?redirect_to=/settings/users',
      json({ email: 'first@example.com' }),
    );
    expect(res.status).toBe(200);
    await drainJobs();
    expect(sent).toHaveLength(1);

    const token = new URL(/https?:\/\/\S+/.exec(sent[0]!.text)![0]).searchParams.get('token')!;
    const verify = await app.request(`/api/auth/magic/verify?token=${token}`);
    expect(verify.status).toBe(302);
    expect(verify.headers.get('location')).toBe('/settings/users');
    const me = await app.request('/api/me', { headers: { cookie: cookieFrom(verify) } });
    expect((await me.json()).user.email).toBe('first@example.com');

    const reuse = await app.request(`/api/auth/magic/verify?token=${token}`);
    expect(reuse.headers.get('location')).toMatch(/error=expired_link/);

    const stranger = await app.request(
      '/api/auth/magic/request',
      json({ email: 'nobody@elsewhere.com' }),
    );
    expect(stranger.status).toBe(200);
    await drainJobs();
    expect(sent).toHaveLength(1);
  });
});

describe('magic link rate limit', () => {
  it('limits requests per email address', async () => {
    const magicWas = env.AUTH_MAGIC_LINK;
    env.AUTH_MAGIC_LINK = true;
    setEmailDriver({ send: async () => {} });
    try {
      const fresh = createApp();
      for (let i = 0; i < 3; i++) {
        expect(
          (await fresh.request('/api/auth/magic/request', json({ email: 'a@example.com' }))).status,
        ).toBe(200);
      }
      const fourth = await fresh.request(
        '/api/auth/magic/request',
        json({ email: 'a@example.com' }),
      );
      expect(fourth.status).toBe(429);
      expect((await fourth.json()).error.code).toBe('rate_limited');
      expect(
        (await fresh.request('/api/auth/magic/request', json({ email: 'b@example.com' }))).status,
      ).toBe(200);
    } finally {
      env.AUTH_MAGIC_LINK = magicWas;
      setEmailDriver(null);
    }
  });
});
