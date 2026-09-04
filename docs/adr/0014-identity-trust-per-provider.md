# 0014 Identity trust is defined per provider; multi-tenant Microsoft needs a tenant allowlist

Accepted, 2026-09-04. Amends `0005`.

## Context

The first implementation of the OpenID Connect client compared the ID token's issuer
against an expected issuer built from the same token's `tid` claim, which made the check
pass for any Microsoft tenant. With `AUTH_MICROSOFT_TENANT=organizations` the discovery
endpoint's key set signs tokens for every tenant, so anyone able to create a tenant and a
user whose email matched an allowed domain could have signed in as that person. The
phase 7 security review found it; no test had asserted that a foreign tenant is refused.

The two providers also differ in what the email claim means. Google sets
`email_verified`. Microsoft does not, and documents that `email` and
`preferred_username` are not verified identifiers; the tenant is the trust boundary.

## Decision

Each provider declares how its identity claim is trusted:

- `verified_claim` (Google): the token must carry `email_verified: true`; `email` is the
  identity.
- `tenant` (Microsoft): the token's `tid` must be in an allowlist. A concrete tenant id in
  `AUTH_MICROSOFT_TENANT` is its own allowlist; `organizations`, `common` and `consumers`
  require `AUTH_MICROSOFT_ALLOWED_TENANTS`, and the process refuses to boot without it.
  Within an allowed tenant, `email` or `preferred_username` is the identity, because the
  tenant administrator controls both and that is exactly who an internal tool trusts.

Acceptable issuers are derived from the allowlist, never from the token being verified.

The start of the flow also sets a short-lived `oidc_state` cookie that the callback must
match, so a captured callback URL cannot sign a victim into the attacker's account.

## Consequences

- A Microsoft deployment needs one more configuration value in multi-tenant mode. That
  is the correct cost.
- `tests/server/oidc.test.ts` asserts that a validly signed token from a non-allowlisted
  tenant is refused, that a `verified_claim` provider cannot be used with a multi-tenant
  discovery document, and that a missing `email_verified` is refused for Google.
- Adding another provider means choosing its identity policy explicitly; there is no
  default.
