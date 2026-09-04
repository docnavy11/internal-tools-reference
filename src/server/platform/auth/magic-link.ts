import { randomBytes } from 'node:crypto';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { env } from '../../env';
import type { Tx } from '../db/client';
import { totalOf } from '../db/count';
import { notify } from '../notify';
import { hashToken } from './sessions';
import { isAllowedDomain, normalizeEmail } from './policy';
import { magicLinkTokens, users } from './table';

const LINK_TTL_MS = 15 * 60 * 1000;

// Sends a link only when the email could actually sign in, so the mailbox of a random
// address never receives anything. The caller responds identically either way.
export async function requestMagicLink(
  tx: Tx,
  rawEmail: string,
  redirectTo: string | null,
): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  const existing = (
    await tx.select({ status: users.status }).from(users).where(eq(users.email, email)).limit(1)
  )[0];
  let eligible: boolean;
  if (existing) {
    eligible = existing.status === 'active';
  } else {
    eligible =
      totalOf(await tx.select({ total: count() }).from(users)) === 0 || isAllowedDomain(email);
  }
  if (!eligible) return false;

  const token = randomBytes(32).toString('base64url');
  await tx.insert(magicLinkTokens).values({
    email,
    tokenHash: hashToken(token),
    redirectTo,
    expiresAt: new Date(Date.now() + LINK_TTL_MS),
  });
  const link = new URL('/api/auth/magic/verify', env.APP_URL);
  link.searchParams.set('token', token);
  await notify.email(
    {
      to: email,
      subject: `Sign in to ${env.APP_NAME}`,
      text: `Use this link to sign in to ${env.APP_NAME}. It is valid for 15 minutes and can be used once.\n\n${link.toString()}\n\nIf you did not request this, you can ignore this email.`,
    },
    { tx },
  );
  return true;
}

export interface MagicLinkVerification {
  email: string;
  redirectTo: string | null;
}

// Consumes the token. Returns null when unknown, expired or already used.
export async function verifyMagicLink(
  tx: Tx,
  token: string,
): Promise<MagicLinkVerification | null> {
  const rows = await tx
    .update(magicLinkTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(magicLinkTokens.tokenHash, hashToken(token)),
        isNull(magicLinkTokens.usedAt),
        gt(magicLinkTokens.expiresAt, new Date()),
      ),
    )
    .returning({ email: magicLinkTokens.email, redirectTo: magicLinkTokens.redirectTo });
  const row = rows[0];
  return row ? { email: row.email, redirectTo: row.redirectTo } : null;
}
