# Security policy

## Reporting a vulnerability

Report it privately through GitHub: **Security → Report a vulnerability** on this
repository, which opens a private advisory. Please do not open a public issue, and
please do not include a working exploit in the first message — a description of the
class of problem and how to reach it is enough to start.

This is a side project with no support commitment and no bounty. Expect a reply in
days rather than hours.

## What this repository is

A template you clone to build an internal tool. It ships a working application, but
**the security of what you deploy is yours**, and it depends on configuration this
repository cannot make for you: which OIDC tenants may sign in, which email domains
are allowed, how many proxy hops to trust, where files are stored.
`docs/CONFIG.md` documents every variable and `docs/SECURITY.md` documents the
invariants the code relies on.

## Before your first real deployment

`docs/SECURITY.md` and `docs/ACCEPTANCE.md` are deliberately explicit about the edge
between what has a test behind it and what does not. Three things in particular have
never been exercised against a real service, only against fakes:

- sign-in against a real Google or Microsoft tenant (tests use a fake OpenID Connect
  provider with locally signed tokens),
- the SMTP driver against a real mail server,
- the S3 driver against AWS or Cloudflare R2 (round-tripped against MinIO by hand once).

Verify those on staging before you invite users. Set `AUTH_DEV_LOGIN=false` — it is
ignored in production, but do not rely on that alone — and give
`AUTH_ALLOWED_DOMAINS` and `AUTH_MICROSOFT_ALLOWED_TENANTS` real values rather than
leaving them open.
