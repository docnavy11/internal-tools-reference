import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  beginAuthorization,
  completeAuthorization,
  setOidcFetch,
  type OidcProvider,
} from '../../src/server/platform/auth/oidc';
import { oidcStates } from '../../src/server/platform/auth/table';
import { getDb, withTransaction } from '../../src/server/platform/db/client';

const ISSUER = 'https://issuer.test';
const provider: OidcProvider = {
  id: 'google',
  label: 'Test IdP',
  clientId: 'client-123',
  clientSecret: 'secret',
  discoveryUrl: `${ISSUER}/.well-known/openid-configuration`,
  scopes: 'openid email profile',
  identity: { kind: 'verified_claim' },
};
const tenantProvider: OidcProvider = {
  ...provider,
  identity: { kind: 'tenant', allowedTenants: ['tenant-42'] },
};

let privateKey: CryptoKey;
let jwks: { keys: unknown[] };

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey as CryptoKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] };
});

afterEach(() => setOidcFetch(null));

interface FakeIdp {
  tokenRequests: URLSearchParams[];
  claims: Record<string, unknown>;
  issuer?: string;
}

function installFakeIdp(opts: Partial<FakeIdp> = {}): FakeIdp {
  const idp: FakeIdp = { tokenRequests: [], claims: {}, ...opts };
  setOidcFetch(async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === provider.discoveryUrl) {
      return Response.json({
        issuer: idp.issuer ?? ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
      });
    }
    if (url === `${ISSUER}/jwks`) return Response.json(jwks);
    if (url === `${ISSUER}/token`) {
      const params = new URLSearchParams(String(init?.body));
      idp.tokenRequests.push(params);
      const claims: Record<string, unknown> = {
        email: 'person@company.com',
        email_verified: true,
        name: 'Person',
        picture: 'https://img.test/p.png',
        ...idp.claims,
      };
      for (const k of Object.keys(claims)) if (claims[k] === undefined) delete claims[k];
      const idToken = await new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer((idp.claims.iss as string) ?? ISSUER)
        .setAudience((idp.claims.aud as string) ?? provider.clientId)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
      return Response.json({ id_token: idToken, access_token: 'x', token_type: 'Bearer' });
    }
    return new Response('not found', { status: 404 });
  });
  return idp;
}

async function begin(redirectTo: string | null = '/customers') {
  const url = new URL(await withTransaction((tx) => beginAuthorization(tx, provider, redirectTo)));
  const state = url.searchParams.get('state')!;
  const stored = (await getDb().select().from(oidcStates))[0]!;
  return { url, state, stored };
}

describe('oidc client', () => {
  it('builds a PKCE authorization request and stores the state', async () => {
    installFakeIdp();
    const { url, stored } = await begin();
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get('client_id')).toBe(provider.clientId);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toMatch(/\/api\/auth\/oidc\/google\/callback$/);
    expect(url.searchParams.get('nonce')).toBe(stored.nonce);
    expect(stored.redirectTo).toBe('/customers');
  });

  it('exchanges the code, verifies the id_token and consumes the state', async () => {
    const idp = installFakeIdp();
    const { state, stored } = await begin();
    idp.claims.nonce = stored.nonce;

    const identity = await withTransaction((tx) =>
      completeAuthorization(tx, provider, { code: 'abc', state }),
    );
    expect(identity).toEqual({
      email: 'person@company.com',
      name: 'Person',
      avatarUrl: 'https://img.test/p.png',
      redirectTo: '/customers',
    });
    const tokenReq = idp.tokenRequests[0]!;
    expect(tokenReq.get('code')).toBe('abc');
    expect(tokenReq.get('code_verifier')).toBe(stored.codeVerifier);
    expect(await getDb().select().from(oidcStates)).toHaveLength(0);
  });

  it('rejects unknown, reused or expired state', async () => {
    const idp = installFakeIdp();
    await expect(
      withTransaction((tx) => completeAuthorization(tx, provider, { code: 'abc', state: 'nope' })),
    ).rejects.toMatchObject({ code: 'invalid_state' });

    const { state, stored } = await begin();
    idp.claims.nonce = stored.nonce;
    await withTransaction((tx) => completeAuthorization(tx, provider, { code: 'abc', state }));
    await expect(
      withTransaction((tx) => completeAuthorization(tx, provider, { code: 'abc', state })),
    ).rejects.toMatchObject({ code: 'invalid_state' });

    const second = await begin();
    await getDb()
      .update(oidcStates)
      .set({ expiresAt: new Date(Date.now() - 1) });
    await expect(
      withTransaction((tx) =>
        completeAuthorization(tx, provider, { code: 'abc', state: second.state }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('rejects a wrong nonce, wrong audience, wrong issuer or unverified email', async () => {
    for (const claims of [
      { nonce: 'wrong' },
      { aud: 'someone-else' },
      { iss: 'https://evil.test' },
      { email_verified: false },
    ]) {
      const idp = installFakeIdp();
      const { state, stored } = await begin();
      idp.claims = { nonce: stored.nonce, ...claims };
      await expect(
        withTransaction((tx) => completeAuthorization(tx, provider, { code: 'abc', state })),
        JSON.stringify(claims),
      ).rejects.toMatchObject({ code: 'provider_error' });
    }
  });

  it('multi-tenant providers: accepts only allowlisted tenants and never trusts the token for the issuer', async () => {
    const idp = installFakeIdp({ issuer: 'https://login.test/{tenantid}/v2.0' });
    let flow = await begin();
    idp.claims = {
      nonce: flow.stored.nonce,
      iss: 'https://login.test/tenant-42/v2.0',
      tid: 'tenant-42',
      email: undefined,
      preferred_username: 'person@company.com',
    };
    const identity = await withTransaction((tx) =>
      completeAuthorization(tx, tenantProvider, { code: 'abc', state: flow.state }),
    );
    expect(identity.email).toBe('person@company.com');

    // A token from another tenant, with a matching issuer for that tenant, is refused even
    // though it is validly signed by the shared JWKS.
    flow = await begin();
    idp.claims = {
      nonce: flow.stored.nonce,
      iss: 'https://login.test/evil-tenant/v2.0',
      tid: 'evil-tenant',
      email: 'victim@company.com',
    };
    await expect(
      withTransaction((tx) =>
        completeAuthorization(tx, tenantProvider, { code: 'abc', state: flow.state }),
      ),
    ).rejects.toMatchObject({ code: 'provider_error' });

    // A verified_claim provider cannot be used with a multi-tenant discovery document.
    flow = await begin();
    idp.claims = {
      nonce: flow.stored.nonce,
      iss: 'https://login.test/tenant-42/v2.0',
      tid: 'tenant-42',
    };
    await expect(
      withTransaction((tx) =>
        completeAuthorization(tx, provider, { code: 'abc', state: flow.state }),
      ),
    ).rejects.toMatchObject({ code: 'provider_error' });
  });

  it('verified_claim providers require email_verified to be exactly true', async () => {
    const idp = installFakeIdp();
    const flow = await begin();
    idp.claims = { nonce: flow.stored.nonce, email_verified: undefined };
    await expect(
      withTransaction((tx) =>
        completeAuthorization(tx, provider, { code: 'abc', state: flow.state }),
      ),
    ).rejects.toMatchObject({ code: 'provider_error' });
  });
});
