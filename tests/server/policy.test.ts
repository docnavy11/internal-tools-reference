import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../../src/server/env';
import { resolveSignIn } from '../../src/server/platform/auth/policy';
import { users } from '../../src/server/platform/auth/table';
import { getDb, withTransaction } from '../../src/server/platform/db/client';
import { expectAudited } from './helpers';

const originalDomains = [...env.AUTH_ALLOWED_DOMAINS];
afterEach(() => {
  env.AUTH_ALLOWED_DOMAINS = [...originalDomains];
});

const signIn = (email: string) =>
  withTransaction((tx) => resolveSignIn(tx, { email, name: 'Test' }));

describe('sign-in policy', () => {
  it('makes the very first user an admin regardless of domain', async () => {
    const result = await signIn('First@Anywhere.io');
    expect(result.ok && result.user.role).toBe('admin');
    expect(result.ok && result.user.email).toBe('first@anywhere.io');
    await expectAudited('users.bootstrap_admin');
  });

  it('refuses unknown users outside the allowed domains', async () => {
    await signIn('admin@company.com');
    const result = await signIn('stranger@elsewhere.com');
    expect(result).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('provisions users from an allowed domain with the default role', async () => {
    await signIn('admin@company.com');
    env.AUTH_ALLOWED_DOMAINS = ['company.com'];
    const result = await signIn('new@company.com');
    expect(result.ok && result.user.role).toBe(env.AUTH_DEFAULT_ROLE);
    await expectAudited('users.auto_provision');
  });

  it('lets invited users in from any domain and refuses disabled ones', async () => {
    await signIn('admin@company.com');
    await getDb().insert(users).values({ email: 'invited@partner.org', role: 'viewer' });
    await getDb().insert(users).values({ email: 'gone@company.com', status: 'disabled' });

    const invited = await signIn('invited@partner.org');
    expect(invited.ok && invited.user.role).toBe('viewer');
    expect(invited.ok && invited.user.lastLoginAt).toBeInstanceOf(Date);

    expect(await signIn('gone@company.com')).toEqual({ ok: false, code: 'disabled' });
  });
});
