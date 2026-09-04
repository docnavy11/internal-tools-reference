import { count, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { env } from '../../env';
import {
  devLoginInput,
  magicLinkRequestInput,
  type AuthProvidersResponse,
  type LoginErrorCode,
  type MeResponse,
} from '../../../shared/auth';
import type { Role } from '../../../shared/permissions';
import { recordAudit } from '../audit/record';
import { withTransaction } from '../db/client';
import { AppError, notFound } from '../http/errors';
import { clientIp, rateLimit, RateLimiter } from '../http/rate-limit';
import { safeRedirect } from '../http/redirect';
import { validate } from '../http/validate';
import { totalOf } from '../db/count';
import type { AppEnv } from '../http/types';
import { serializeUser, serializeCurrentUser } from '../users/serialize';
import { requestMagicLink, verifyMagicLink } from './magic-link';
import { permissionsForRole, publicRoute, requireAuth } from './middleware';
import {
  beginAuthorization,
  completeAuthorization,
  configuredProviders,
  getProvider,
  OidcError,
} from './oidc';
import { resolveSignIn } from './policy';
import {
  clearSessionCookie,
  createSession,
  deleteSessionByToken,
  readSessionCookie,
  setSessionCookie,
} from './sessions';
import { users } from './table';

const devLoginEnabled = () => env.AUTH_DEV_LOGIN && env.NODE_ENV !== 'production';

export function authRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/auth/providers', publicRoute(), (c) => {
    const body: AuthProvidersResponse = {
      oidc: configuredProviders().map((p) => ({ id: p.id, label: p.label })),
      magicLink: env.AUTH_MAGIC_LINK,
      devLogin: devLoginEnabled(),
    };
    return c.json(body);
  });

  const loginError = (c: Context<AppEnv>, code: LoginErrorCode, redirectTo: string) =>
    c.redirect(`/login?error=${code}&redirect_to=${encodeURIComponent(redirectTo)}`);

  type SignInOutcome =
    { redirectTo: string; error: LoginErrorCode } | { redirectTo: string; token: string };

  r.get('/auth/oidc/:provider/start', publicRoute(), async (c) => {
    const provider = getProvider(c.req.param('provider'));
    const redirectTo = safeRedirect(c.req.query('redirect_to'));
    if (!provider) return loginError(c, 'unknown_provider', redirectTo);
    const url = await withTransaction((tx) => beginAuthorization(tx, provider, redirectTo));
    return c.redirect(url);
  });

  r.get('/auth/oidc/:provider/callback', publicRoute(), async (c) => {
    const provider = getProvider(c.req.param('provider'));
    if (!provider) return loginError(c, 'unknown_provider', '/');
    const code = c.req.query('code');
    const state = c.req.query('state');
    if (!code || !state)
      return loginError(c, c.req.query('error') ? 'provider_error' : 'invalid_state', '/');

    try {
      const outcome = await withTransaction<SignInOutcome>(async (tx) => {
        const identity = await completeAuthorization(tx, provider, { code, state });
        const redirectTo = safeRedirect(identity.redirectTo);
        const result = await resolveSignIn(tx, identity, c.get('requestId'));
        if (!result.ok) return { redirectTo, error: result.code };
        const token = await createSession(tx, {
          userId: result.user.id,
          ip: clientIp(c.req.raw.headers),
          userAgent: c.req.header('user-agent'),
        });
        return { redirectTo, token };
      });
      if ('error' in outcome) return loginError(c, outcome.error, outcome.redirectTo);
      setSessionCookie(c, outcome.token);
      return c.redirect(outcome.redirectTo);
    } catch (err) {
      if (err instanceof OidcError) {
        c.get('log').warn({ err: err.message, provider: provider.id }, 'oidc sign-in failed');
        return loginError(c, err.code, '/');
      }
      throw err;
    }
  });

  // Per IP through middleware; per email inside the handler once the body is parsed.
  const perEmail = new RateLimiter(3, 15 * 60 * 1000);
  r.post(
    '/auth/magic/request',
    publicRoute(),
    rateLimit({ limit: 10, windowMs: 15 * 60 * 1000 }),
    validate('json', magicLinkRequestInput),
    async (c) => {
      if (!env.AUTH_MAGIC_LINK) throw notFound('Magic link sign-in');
      const { email } = c.req.valid('json');
      if (!perEmail.hit(email.toLowerCase())) {
        throw new AppError(
          'rate_limited',
          429,
          'Too many sign-in links requested for this address. Try again later.',
        );
      }
      const redirectTo = safeRedirect(c.req.query('redirect_to'));
      const sent = await withTransaction((tx) => requestMagicLink(tx, email, redirectTo));
      c.get('log').info({ sent }, 'magic link requested');
      return c.json({ ok: true });
    },
  );

  r.get('/auth/magic/verify', publicRoute(), async (c) => {
    const token = c.req.query('token');
    if (!token) return loginError(c, 'expired_link', '/');
    const outcome = await withTransaction<SignInOutcome>(async (tx) => {
      const verified = await verifyMagicLink(tx, token);
      if (!verified) return { error: 'expired_link', redirectTo: '/' };
      const redirectTo = safeRedirect(verified.redirectTo);
      const result = await resolveSignIn(tx, { email: verified.email }, c.get('requestId'));
      if (!result.ok) return { error: result.code, redirectTo };
      const sessionToken = await createSession(tx, {
        userId: result.user.id,
        ip: clientIp(c.req.raw.headers),
        userAgent: c.req.header('user-agent'),
      });
      return { token: sessionToken, redirectTo };
    });
    if ('error' in outcome) return loginError(c, outcome.error, outcome.redirectTo);
    setSessionCookie(c, outcome.token);
    return c.redirect(outcome.redirectTo);
  });

  // Development only. Creates the user if needed regardless of domain policy, because
  // the point is to try the app as different roles. First user still becomes admin.
  r.post('/auth/dev', publicRoute(), validate('json', devLoginInput), async (c) => {
    if (!devLoginEnabled()) throw notFound();
    const email = c.req.valid('json').email.toLowerCase();
    const token = await withTransaction(async (tx) => {
      let user = (await tx.select().from(users).where(eq(users.email, email)).limit(1))[0];
      if (!user) {
        const total = totalOf(await tx.select({ total: count() }).from(users));
        user = (
          await tx
            .insert(users)
            .values({
              email,
              role: total === 0 ? 'admin' : env.AUTH_DEFAULT_ROLE,
              lastLoginAt: new Date(),
            })
            .returning()
        )[0]!;
        await recordAudit(
          tx,
          { type: 'user', userId: user.id, requestId: c.get('requestId') },
          {
            action: 'users.dev_login_create',
            entityType: 'user',
            entityId: user.id,
            after: serializeUser(user),
          },
        );
      } else if (user.status !== 'active') {
        throw new AppError('disabled', 403, 'This account is disabled');
      } else {
        await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      }
      return createSession(tx, {
        userId: user.id,
        ip: clientIp(c.req.raw.headers),
        userAgent: c.req.header('user-agent'),
      });
    });
    setSessionCookie(c, token);
    return c.json({ ok: true });
  });

  r.post('/auth/logout', requireAuth(), async (c) => {
    const token = readSessionCookie(c);
    if (token) await withTransaction((tx) => deleteSessionByToken(tx, token));
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  r.get('/me', requireAuth(), (c) => {
    const { user } = c.get('session')!;
    const body: MeResponse = {
      user: serializeCurrentUser(user),
      permissions: [...permissionsForRole(user.role as Role)],
    };
    return c.json(body);
  });

  return r;
}
