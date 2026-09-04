import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../../env';
import type { OidcProviderId } from '../../../shared/auth';
import type { Tx } from '../db/client';
import { AppError } from '../http/errors';
import { oidcStates } from './table';

// Generic OpenID Connect authorization-code client with PKCE (adr/0005). Providers are
// configuration; anything with a discovery document works.

export interface OidcProvider {
  id: OidcProviderId;
  label: string;
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
  scopes: string;
  // How the email in the token is trusted:
  // - 'verified_claim': the token must carry email_verified: true (Google).
  // - 'tenant': the token's tid must be in allowedTenants; the email or UPN is then the
  //   tenant administrator's statement, which is what an internal tool wants (Microsoft).
  identity: { kind: 'verified_claim' } | { kind: 'tenant'; allowedTenants: string[] };
}

export function configuredProviders(): OidcProvider[] {
  const list: OidcProvider[] = [];
  if (env.AUTH_GOOGLE_CLIENT_ID && env.AUTH_GOOGLE_CLIENT_SECRET) {
    list.push({
      id: 'google',
      label: 'Google',
      clientId: env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
      discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
      scopes: 'openid email profile',
      identity: { kind: 'verified_claim' },
    });
  }
  if (env.AUTH_MICROSOFT_CLIENT_ID && env.AUTH_MICROSOFT_CLIENT_SECRET) {
    list.push({
      id: 'microsoft',
      label: 'Microsoft',
      clientId: env.AUTH_MICROSOFT_CLIENT_ID,
      clientSecret: env.AUTH_MICROSOFT_CLIENT_SECRET,
      discoveryUrl: `https://login.microsoftonline.com/${env.AUTH_MICROSOFT_TENANT}/v2.0/.well-known/openid-configuration`,
      scopes: 'openid email profile',
      identity: {
        kind: 'tenant',
        // A concrete tenant id in AUTH_MICROSOFT_TENANT is itself the allowlist.
        allowedTenants: ['organizations', 'common', 'consumers'].includes(
          env.AUTH_MICROSOFT_TENANT.toLowerCase(),
        )
          ? env.AUTH_MICROSOFT_ALLOWED_TENANTS
          : [env.AUTH_MICROSOFT_TENANT.toLowerCase()],
      },
    });
  }
  return list;
}

export function getProvider(id: string): OidcProvider | undefined {
  return configuredProviders().find((p) => p.id === id);
}

export function redirectUri(provider: OidcProvider): string {
  return `${env.APP_URL}/api/auth/oidc/${provider.id}/callback`;
}

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

// Injectable for tests. Defaults to the global fetch.
export type FetchLike = typeof fetch;
let fetchImpl: FetchLike = (...args) => fetch(...args);
export function setOidcFetch(f: FetchLike | null): void {
  fetchImpl = f ?? ((...args) => fetch(...args));
  discoveryCache.clear();
  jwksCache.clear();
}

const discoveryCache = new Map<string, Discovery>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function discover(provider: OidcProvider): Promise<Discovery> {
  const cached = discoveryCache.get(provider.id);
  if (cached) return cached;
  const res = await fetchImpl(provider.discoveryUrl);
  if (!res.ok)
    throw new AppError(
      'provider_error',
      502,
      `OIDC discovery failed for ${provider.id} (${res.status})`,
    );
  const doc = (await res.json()) as Discovery;
  for (const key of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
    if (typeof doc[key] !== 'string')
      throw new AppError('provider_error', 502, `OIDC discovery for ${provider.id} lacks ${key}`);
  }
  discoveryCache.set(provider.id, doc);
  return doc;
}

const STATE_TTL_MS = 10 * 60 * 1000;

function b64url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

// Step 1: store state, nonce and PKCE verifier, return the provider URL to redirect to.
export async function beginAuthorization(
  tx: Tx,
  provider: OidcProvider,
  redirectTo: string | null,
): Promise<string> {
  const discovery = await discover(provider);
  const state = b64url(randomBytes(32));
  const nonce = b64url(randomBytes(32));
  const codeVerifier = b64url(randomBytes(48));
  const codeChallenge = b64url(createHash('sha256').update(codeVerifier).digest());

  await tx.insert(oidcStates).values({
    state,
    nonce,
    codeVerifier,
    provider: provider.id,
    redirectTo,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', provider.clientId);
  url.searchParams.set('redirect_uri', redirectUri(provider));
  url.searchParams.set('scope', provider.scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export interface OidcIdentity {
  email: string;
  name: string | null;
  avatarUrl: string | null;
  redirectTo: string | null;
}

export class OidcError extends Error {
  constructor(
    public readonly code: 'invalid_state' | 'provider_error',
    message: string,
  ) {
    super(message);
  }
}

// Step 2: consume the state, exchange the code, verify the ID token, return the identity.
export async function completeAuthorization(
  tx: Tx,
  provider: OidcProvider,
  params: { code: string; state: string },
): Promise<OidcIdentity> {
  const rows = await tx
    .delete(oidcStates)
    .where(
      and(
        eq(oidcStates.state, params.state),
        eq(oidcStates.provider, provider.id),
        gt(oidcStates.expiresAt, new Date()),
      ),
    )
    .returning();
  const stored = rows[0];
  if (!stored) throw new OidcError('invalid_state', 'unknown or expired state');

  const discovery = await discover(provider);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: redirectUri(provider),
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    code_verifier: stored.codeVerifier,
  });
  const tokenRes = await fetchImpl(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  });
  if (!tokenRes.ok)
    throw new OidcError('provider_error', `token endpoint returned ${tokenRes.status}`);
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) throw new OidcError('provider_error', 'token response lacks id_token');

  const payload = await verifyIdToken(provider, discovery, tokens.id_token);
  if (payload.nonce !== stored.nonce) throw new OidcError('provider_error', 'nonce mismatch');

  let email: string | null = null;
  if (provider.identity.kind === 'tenant') {
    // The tenant allowlist is the trust boundary; within it the UPN is authoritative.
    const tid = typeof payload.tid === 'string' ? payload.tid.toLowerCase() : null;
    if (!tid || !provider.identity.allowedTenants.includes(tid)) {
      throw new OidcError('provider_error', `tenant ${tid ?? '(none)'} is not allowed to sign in`);
    }
    email =
      typeof payload.email === 'string'
        ? payload.email
        : typeof payload.preferred_username === 'string'
          ? payload.preferred_username
          : null;
  } else {
    // Only an explicitly verified email claim identifies the person.
    if (payload.email_verified !== true)
      throw new OidcError('provider_error', 'email not verified');
    email = typeof payload.email === 'string' ? payload.email : null;
  }
  if (!email || !email.includes('@')) throw new OidcError('provider_error', 'no email in id_token');

  return {
    email,
    name: typeof payload.name === 'string' ? payload.name : null,
    avatarUrl: typeof payload.picture === 'string' ? payload.picture : null,
    redirectTo: stored.redirectTo,
  };
}

async function verifyIdToken(
  provider: OidcProvider,
  discovery: Discovery,
  idToken: string,
): Promise<JWTPayload> {
  let jwks = jwksCache.get(provider.id);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(discovery.jwks_uri), {
      [customFetch]: fetchImpl,
    } as Parameters<typeof createRemoteJWKSet>[1]);
    jwksCache.set(provider.id, jwks);
  }
  // Microsoft's multi-tenant discovery document carries a literal "{tenantid}" in the
  // issuer. The real issuer is per tenant, so the acceptable issuers come from the tenant
  // allowlist, never from anything inside the token being verified.
  const acceptableIssuers = new Set<string>();
  if (discovery.issuer.includes('{tenantid}')) {
    if (provider.identity.kind !== 'tenant')
      throw new OidcError('provider_error', 'multi-tenant issuer needs a tenant allowlist');
    for (const tid of provider.identity.allowedTenants)
      acceptableIssuers.add(discovery.issuer.replace('{tenantid}', tid));
  } else {
    acceptableIssuers.add(discovery.issuer);
  }
  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      audience: provider.clientId,
      clockTolerance: 60,
    });
    if (!payload.iss || !acceptableIssuers.has(payload.iss))
      throw new OidcError('provider_error', 'issuer mismatch');
    return payload;
  } catch (err) {
    if (err instanceof OidcError) throw err;
    throw new OidcError(
      'provider_error',
      `id_token verification failed: ${(err as Error).message}`,
    );
  }
}

// jose lets the JWKS fetcher be replaced through a symbol-keyed option.
import { customFetch } from 'jose';
