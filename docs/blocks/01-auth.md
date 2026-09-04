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

## Done when

- Sign in with Google works locally against a real Google OAuth client.
- Microsoft flow works with a test tenant, or is verified against the discovery
  document format if no tenant is available (recorded which).
- Magic link works end to end with the console email driver.
- Tests: state mismatch rejected, nonce mismatch rejected, expired token rejected,
  disabled user refused, first user becomes admin, domain policy enforced,
  session expiry and sliding renewal.
