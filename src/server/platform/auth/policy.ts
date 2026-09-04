import { count, eq } from 'drizzle-orm';
import { env } from '../../env';
import type { LoginErrorCode } from '../../../shared/auth';
import { recordAudit } from '../audit/record';
import type { Tx } from '../db/client';
import { totalOf } from '../db/count';
import { serializeUser } from '../users/serialize';
import { users } from './table';

export interface SignInProfile {
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export type SignInResult =
  { ok: true; user: typeof users.$inferSelect } | { ok: false; code: LoginErrorCode };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedDomain(email: string): boolean {
  const domain = email.split('@')[1];
  return !!domain && env.AUTH_ALLOWED_DOMAINS.includes(domain);
}

// Decides whether a verified identity may sign in and returns the user row.
// Existing user: refused if disabled, otherwise profile and last login refreshed.
// New identity: becomes admin when the users table is empty, otherwise gets
// AUTH_DEFAULT_ROLE when the email domain is allowed, otherwise refused.
// Invited users already have a row, so they pass the "existing user" branch.
export async function resolveSignIn(
  tx: Tx,
  profile: SignInProfile,
  requestId?: string,
): Promise<SignInResult> {
  const email = normalizeEmail(profile.email);
  const now = new Date();
  const existing = (await tx.select().from(users).where(eq(users.email, email)).limit(1))[0];

  if (existing) {
    if (existing.status !== 'active') return { ok: false, code: 'disabled' };
    const updated = (
      await tx
        .update(users)
        .set({
          name: profile.name ?? existing.name,
          avatarUrl: profile.avatarUrl ?? existing.avatarUrl,
          lastLoginAt: now,
        })
        .where(eq(users.id, existing.id))
        .returning()
    )[0]!;
    return { ok: true, user: updated };
  }

  const isFirstUser = totalOf(await tx.select({ total: count() }).from(users)) === 0;
  if (!isFirstUser && !isAllowedDomain(email)) return { ok: false, code: 'not_allowed' };

  const created = (
    await tx
      .insert(users)
      .values({
        email,
        name: profile.name ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        role: isFirstUser ? 'admin' : env.AUTH_DEFAULT_ROLE,
        lastLoginAt: now,
      })
      .returning()
  )[0]!;
  await recordAudit(
    tx,
    { type: 'user', userId: created.id, requestId },
    {
      action: isFirstUser ? 'users.bootstrap_admin' : 'users.auto_provision',
      entityType: 'user',
      entityId: created.id,
      after: serializeUser(created),
    },
  );
  return { ok: true, user: created };
}
