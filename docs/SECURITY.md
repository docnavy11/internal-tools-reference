# Security notes

What protects this application, what a review found and fixed, and what has not been
verified. Read this before changing anything under `src/server/platform/auth`,
`webhooks`, `storage`, or `http`.

## Invariants that must not be simplified away

Each of these looks like it could be shortened. Each one is load-bearing.

- `platform/audit/record.ts`: the audit row is written inside the same transaction as
  the change it describes, so a change can never commit without its trail.
- `platform/auth/sessions.ts`: only the SHA-256 hash of the session token is stored; the
  raw value exists only in the cookie.
- `platform/auth/magic-link.ts` and `platform/auth/oidc.ts`: single-use consumption of
  magic link tokens and OIDC states is one atomic `UPDATE`/`DELETE … RETURNING`, with no
  check-then-act gap.
- `platform/auth/oidc.ts`: acceptable issuers come from configuration (the tenant
  allowlist), never from the token being verified; Google tokens need
  `email_verified: true`; Microsoft tokens need an allowlisted `tid` (`adr/0014`).
- `platform/auth/routes.ts`: the `oidc_state` cookie set at start must match the `state`
  parameter at the callback (login CSRF).
- `platform/auth/middleware.ts` with `tests/server/authz-coverage.test.ts`: every `/api`
  route carries exactly one authorization marker; the test fails otherwise.
- `platform/http/rate-limit.ts`: `x-forwarded-for` is trusted only for
  `TRUST_PROXY_HOPS` hops, counted from the right; the leftmost value is never used.
- `shared/redirect.ts`: post-login destinations are relative paths without whitespace,
  backslashes or control characters, enforced on both sides.
- `platform/csv/stream.ts`: cells starting with `= + - @` or a tab get an apostrophe
  prefix (spreadsheet formula injection).
- `platform/storage/sniff.ts` with `platform/storage/routes.ts`: content type comes from
  the bytes; HTML and SVG fall to `text/plain` and are served as attachments with
  `nosniff`. This is what blocks stored cross-site scripting through uploads.
- `platform/storage/disk.ts`: resolve-then-prefix-check containment of storage keys.
- `platform/webhooks/verify.ts`: `timingSafeEqual`, a signed timestamp replay window, and
  a refusal to construct a verifier with an empty secret.
- `features/customers/service.ts` and `platform/users/service.ts`: LIKE patterns are
  escaped (`% _ \`) and array membership uses a parameterised `any()`.
- `features/customers/import.ts`: import status is visible to the requester or an admin
  only, the one place the template does per-record ownership.
- `features/notes/service.ts`: edit and delete are limited to the note's author or an
  admin, on top of the `notes:write` permission.
- `platform/users/service.ts`: the last-admin check locks all active admin rows before
  counting, so two concurrent demotions cannot leave the tool without an admin.
- `platform/jobs/define.ts`: jobs marked `sensitive` have their payload redacted in the
  admin API; the magic link email job is one.

## The phase 7 review

An independent review of the auth, HTTP, webhook, storage, notes, import, users and
settings code found nine issues plus low items. All were fixed in the same phase and
each has a test:

1. Microsoft issuer check compared the token against itself (high). Tenant allowlist and
   per-provider identity policy, `adr/0014`.
2. `x-forwarded-for` trusted unconditionally (high). `TRUST_PROXY_HOPS`.
3. OIDC state not bound to the browser (medium). `oidc_state` cookie.
4. Open redirect through tab or newline (medium). Shared redirect rule.
5. Live magic link tokens visible to admins through the jobs API (medium). Dedicated
   sensitive job.
6. Console email driver logged sign-in links (medium). Bodies only in development;
   production requires SMTP for magic links.
7. Last-admin guard race (medium). Row locks.
8. Auth tables never reaped, OIDC start unlimited (medium). Hourly cleanup job, rate limit.
9. HMAC verifier accepted an empty secret (medium). Throws at construction.

Low: page number cap, import row cap during parse, backslash in LIKE escaping, multipart
body limit app-wide, domain extraction after the last `@`.

Accepted as is: a client-supplied `x-request-id` (validated to a safe character set)
reaches logs and audit metadata; magic link requests for ineligible addresses return
faster than eligible ones (a timing oracle for "is this address known", judged acceptable
for an internal tool behind SSO domains).

## Not verified

- Sign-in against a real Google or Microsoft tenant. Tests use a fake OpenID Connect
  provider with locally signed tokens.
- The SMTP driver against a real mail server.
- The S3 driver against AWS or Cloudflare R2 (verified against MinIO).
- Behaviour behind a real reverse proxy with `TRUST_PROXY_HOPS` set.

Do these on the first staging deployment, before inviting users.
