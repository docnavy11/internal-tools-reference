# 01 Auth

Staff sign in with Google or Microsoft, or with a magic link. Server-side sessions.
No passwords. Decision record: `../adr/0005`.

## Data model

`users`
- `id uuid pk`
- `email text unique not null` (lower-cased)
- `name text`, `avatar_url text`
- `role text not null` check in roles (see block 02)
- `status text not null default 'active'` check in (`active`, `disabled`)
- `invited_by uuid null fk users`, `last_login_at timestamptz null`
- `created_at`, `updated_at`

`sessions`
- `id uuid pk`
- `token_hash text unique not null` (SHA-256 of the cookie value)
- `user_id uuid fk users on delete cascade`
- `expires_at timestamptz not null`, `last_seen_at timestamptz`
- `ip text`, `user_agent text`, `created_at`

`magic_link_tokens`
- `id uuid pk`, `email text`, `token_hash text unique`, `expires_at`, `used_at null`,
  `created_at`

`oidc_states` (short-lived, could be a signed cookie instead; a table keeps it simple)
- `state text pk`, `nonce text`, `code_verifier text`, `provider text`,
  `redirect_to text`, `expires_at`

## Access policy

A person may sign in when either: their email domain is in `AUTH_ALLOWED_DOMAINS`,
or a `users` row already exists for their email (invited by an admin). When the
`users` table is empty, the first successful sign-in creates an `admin`. Otherwise
new users get `AUTH_DEFAULT_ROLE` (default `member`). Disabled users are refused at
sign-in and existing sessions are invalidated when an admin disables them.

## Flows

OIDC (Google, Microsoft, any other discovery-capable provider)
1. `GET /api/auth/oidc/:provider/start?redirect_to=/customers` creates state, nonce,
   PKCE verifier, stores them, redirects to the provider's authorization endpoint
   with `scope=openid email profile`.
2. `GET /api/auth/oidc/:provider/callback?code&state` loads and deletes the state
   row, exchanges the code (with the verifier) at the token endpoint, verifies the ID
   token signature, issuer, audience, expiry and nonce with `jose` and the provider's
   JWKS, applies the access policy, upserts the user, creates a session, sets the
   cookie, redirects to `redirect_to` (validated to be a relative path).

Provider configuration in `env.ts`:
- Google: `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`; discovery at
  `https://accounts.google.com/.well-known/openid-configuration`.
- Microsoft: `AUTH_MICROSOFT_CLIENT_ID`, `AUTH_MICROSOFT_CLIENT_SECRET`,
  `AUTH_MICROSOFT_TENANT` (a tenant id, or `organizations`); discovery at
  `https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration`.
  Issuer validation must accept the tenant-specific issuer the token carries.
- A provider is enabled when its client id is set. The login page lists enabled ones.

Magic link
1. `POST /api/auth/magic/request { email }`: always responds 200 with the same
   message to avoid account enumeration. If the policy allows the email, create a
   token (32 random bytes, hash stored), enqueue `notify.email` with the link.
   Rate limit: 3 per email per 15 minutes, 10 per IP per 15 minutes.
2. `GET /api/auth/magic/verify?token`: single use, 15-minute expiry, then the same
   user upsert and session creation as OIDC.

Sessions
- Cookie `sid`, value is the raw token, `HttpOnly`, `SameSite=Lax`, `Path=/`,
  `Secure` when `APP_URL` is https. 30-day expiry, extended when more than a day has
  passed since `last_seen_at`.
- `POST /api/auth/logout` deletes the session and clears the cookie.
- `GET /api/me` returns the user, role and permission list, or 401.
- Admin can revoke all sessions of a user from the Users page.

Dev login
- `POST /api/auth/dev { email }` creates or finds the user and a session. Refuses
  unless `NODE_ENV !== 'production'` and `AUTH_DEV_LOGIN=true`. The seed script
  creates `admin@local.test` as admin. Playwright uses this.

## Client

- `/login` page: buttons per enabled provider, magic link form, dev login form when
  enabled. Returns the user to the page they wanted.
- `SessionProvider` fetches `/api/me` once, exposes `user`, `permissions`,
  `isLoading`. Routes are wrapped in `RequireAuth` which redirects to `/login`.
- 401 from any API call clears the session state and redirects to `/login`.

## As built (phase 2)

- Files: `platform/auth/{table,sessions,oidc,magic-link,policy,middleware,routes}.ts`.
- Dev login differs from the spec in one way: it creates a missing user regardless of
  the domain allowlist (first user still becomes admin, later ones get
  `AUTH_DEFAULT_ROLE`), because its purpose is trying the app as different roles.
- Magic link `redirect_to` travels in the query string of the request call, not the
  body, and is embedded in the emailed link. Per-IP limit through middleware, per-email
  limit inside the handler. Email goes through `platform/notify/email.ts` synchronously
  with the console driver until phase 5 moves it into a job.
- CSRF: Origin must match `APP_URL` when present; requests without Origin are checked
  against `Sec-Fetch-Site`; requests with neither header (curl, tests) pass.
- Microsoft: the discovery document for `organizations`/`common` carries a literal
  `{tenantid}` in the issuer and its JWKS signs tokens for every tenant, so the trust
  boundary is `AUTH_MICROSOFT_ALLOWED_TENANTS` (required in that mode; a concrete tenant id
  in `AUTH_MICROSOFT_TENANT` is its own allowlist). The token's `tid` must be allowlisted,
  the acceptable issuers are derived from the allowlist (never from the token), and only
  then is `email` or `preferred_username` accepted as the identity. Google tokens must
  carry `email_verified: true`. Found by the phase 7 security review; the earlier version
  compared the token's issuer against itself.
- Login CSRF: `start` sets an `oidc_state` cookie (HttpOnly, 10 minutes, path
  `/api/auth/oidc`) and the callback requires it to equal the `state` parameter, so a
  callback URL captured by an attacker cannot sign a victim into the attacker's account.
- Client IP for rate limits, sessions and audit metadata comes from the socket unless
  `TRUST_PROXY_HOPS` says how many `x-forwarded-for` hops to trust; the leftmost value is
  never used.
- Redirect targets refuse whitespace and control characters (browsers strip tabs and
  newlines, which would turn `/<tab>/evil` into `//evil`).
- Not verified against a real Google or Microsoft tenant yet. Tests use a fake
  provider with locally signed RS256 tokens (`tests/server/oidc.test.ts`).

## Done when

- Sign in with Google works locally against a real Google OAuth client.
- Microsoft flow works with a test tenant, or is verified against the discovery
  document format if no tenant is available (recorded which).
- Magic link works end to end with the console email driver.
- Tests: state mismatch rejected, nonce mismatch rejected, expired token rejected,
  disabled user refused, first user becomes admin, domain policy enforced,
  session expiry and sliding renewal.
