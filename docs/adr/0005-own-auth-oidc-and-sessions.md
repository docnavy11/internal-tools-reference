# 0005 Authentication is implemented in the repo: OIDC client plus session table

Accepted, 2026-09-04

## Context

The popular options are better-auth, Auth.js, or the now-archived Lucia. Auth.js is
shaped around Next.js. better-auth is framework-agnostic and popular but its API
has moved quickly and the builder does not know its current surface in depth
(`0002`). Lucia's maintainers themselves now recommend writing sessions by hand
and published the pattern as a guide.

The need is narrow: Google and Microsoft sign-in for staff, a magic link fallback,
and server sessions. Both providers are standard OpenID Connect with discovery
documents.

## Decision

Write it:

- A generic OIDC client (`platform/auth/oidc.ts`): fetch the discovery document,
  build the authorization URL with `state`, `nonce` and PKCE, exchange the code,
  verify the ID token with `jose` against the provider's JWKS, read `email`,
  `name`, `picture`. Providers are configuration, not code. Microsoft's
  per-tenant issuer is handled by building the discovery URL from `AUTH_MICROSOFT_TENANT`.
- Sessions (`platform/auth/sessions.ts`): random 256-bit token, SHA-256 hash
  stored, 30-day sliding expiry, cookie `sid` `HttpOnly` `SameSite=Lax` `Secure`.
- Magic link (`platform/auth/magic-link.ts`): single-use token, 15-minute expiry,
  sent through the email adapter via a job, rate limited per email and per IP.
- Dev login for local work, compiled in but refused unless `NODE_ENV !== 'production'`
  and `AUTH_DEV_LOGIN=true`.

## Consequences

- Roughly three hundred lines of auth code that the team fully owns and can read
  in one sitting. Tested directly.
- We carry the security responsibility. Mitigated by following the standard OIDC
  code flow with PKCE and nonce, hashing stored tokens, and keeping the surface
  small. Reviewed in the security pass of phase 7.
- No password storage anywhere, which removes the largest class of auth risk.
- Adding another OIDC provider (Okta, Keycloak) is a config entry.
