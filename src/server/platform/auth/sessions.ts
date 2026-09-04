import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { env } from '../../env';
import { getDb, type DbOrTx } from '../db/client';
import { sessions, users } from './table';

export const SESSION_COOKIE = 'sid';
const DAY_MS = 24 * 60 * 60 * 1000;

export type SessionUser = typeof users.$inferSelect;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface CreateSessionInput {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}

// Returns the raw token for the cookie. Only its hash is stored.
export async function createSession(db: DbOrTx, input: CreateSessionInput): Promise<string> {
  const token = newToken();
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId: input.userId,
    expiresAt: new Date(Date.now() + env.SESSION_TTL_DAYS * DAY_MS),
    ip: input.ip ?? null,
    userAgent: input.userAgent?.slice(0, 512) ?? null,
  });
  return token;
}

export interface ResolvedSession {
  sessionId: string;
  user: SessionUser;
}

// Look up a live session and its user. Slides the expiry forward once a day so active
// users stay signed in and idle ones drop off after SESSION_TTL_DAYS.
export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.user.status !== 'active') return null;
  if (now.getTime() - row.session.lastSeenAt.getTime() > DAY_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + env.SESSION_TTL_DAYS * DAY_MS) })
      .where(eq(sessions.id, row.session.id));
  }
  return { sessionId: row.session.id, user: row.user };
}

export async function deleteSessionByToken(db: DbOrTx, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function deleteUserSessions(db: DbOrTx, userId: string): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return deleted.length;
}

const secureCookies = env.APP_URL.startsWith('https://');

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'Lax',
    path: '/',
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: secureCookies });
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}
