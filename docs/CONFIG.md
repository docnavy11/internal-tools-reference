# Configuration reference

All configuration is environment variables, read and validated once in
`src/server/env.ts`. Required means the process refuses to start without it.
Phase 7 adds a test that fails when this file and `env.ts` disagree.

Development tooling reads two extra variables that the application itself never sees:
`VITE_HOST=true` makes the Vite dev server listen on all interfaces and
`VITE_ALLOWED_HOSTS=host1,host2` lists the hostnames browsers may use to reach it. When
the browser is on another machine, `APP_URL` must be that hostname and port as well, for
example `APP_URL=http://dev.example:5174`, or the API's Origin check refuses writes.

Locally, `.env` is loaded with Node's `process.loadEnvFile`, which never overrides a
variable already set in the shell. If something behaves unexpectedly, check for a
stray exported variable (a `PORT` exported in your profile is the classic case).

## Core

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` disables dev login and pretty logs |
| `APP_NAME` | no | `internal-tools` | shown in the shell, logs, emails |
| `APP_URL` | yes | | public base URL, used for cookies, links, Origin check |
| `APP_MODE` | no | `all` | `web`, `worker`, or `all` |
| `PORT` | no | `3000` | HTTP port for web and all |
| `HEALTH_PORT` | no | `3001` | health endpoints in worker mode |
| `APP_VERSION` | no | `dev` | git sha baked into the image |
| `LOG_LEVEL` | no | `info` | pino level |

## Database

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | | Postgres connection string |
| `DATABASE_URL_TEST` | tests | | separate database for Vitest |
| `DATABASE_URL_E2E` | e2e | | separate database for Playwright, so both suites can run at once |
| `DATABASE_POOL_MAX` | no | `10` | pool size |
| `MIGRATE_ON_START` | no | `false` | run migrations at boot (any mode; an advisory lock serialises replicas) |

## Auth

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AUTH_ALLOWED_DOMAINS` | no | | comma-separated email domains allowed to sign in |
| `AUTH_DEFAULT_ROLE` | no | `member` | role for new users who pass the domain check |
| `AUTH_GOOGLE_CLIENT_ID` | no | | enables Google sign-in |
| `AUTH_GOOGLE_CLIENT_SECRET` | with id | | |
| `AUTH_MICROSOFT_CLIENT_ID` | no | | enables Microsoft sign-in |
| `AUTH_MICROSOFT_CLIENT_SECRET` | with id | | |
| `AUTH_MICROSOFT_TENANT` | with id | `organizations` | tenant id or `organizations` |
| `AUTH_MICROSOFT_ALLOWED_TENANTS` | when tenant is organizations/common | | comma-separated tenant ids whose users may sign in; a concrete `AUTH_MICROSOFT_TENANT` is its own allowlist |
| `AUTH_MAGIC_LINK` | no | `false` | enables magic link sign-in, needs email configured |
| `AUTH_DEV_LOGIN` | no | `false` | dev login, ignored in production |
| `SESSION_TTL_DAYS` | no | `30` | |
| `TRUST_PROXY_HOPS` | no | `0` | reverse proxies in front of the app; 0 ignores `x-forwarded-for`, N takes the Nth address from the right |

## Jobs

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `JOBS_CONCURRENCY` | no | `4` | claim loops per worker process |
| `JOBS_POLL_MS` | no | `1000` | idle poll interval |
| `JOBS_RETENTION_DAYS` | no | `30` | succeeded jobs are deleted after this |
| `JOBS_SHUTDOWN_GRACE_MS` | no | `30000` | wait for running jobs on SIGTERM |

## Storage

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `STORAGE_DRIVER` | no | `disk` | `disk` or `s3` |
| `FILES_DIR` | disk | `./data/files` | |
| `UPLOAD_MAX_BYTES` | no | `26214400` | 25 MB |
| `FILES_TRASH_DAYS` | no | `30` | soft-deleted files are purged after this |
| `S3_BUCKET` | s3 | | |
| `S3_REGION` | s3 | | |
| `S3_ENDPOINT` | no | | for R2, MinIO, other S3-compatible stores |
| `S3_ACCESS_KEY_ID` | s3 | | |
| `S3_SECRET_ACCESS_KEY` | s3 | | |
| `S3_FORCE_PATH_STYLE` | no | `false` | needed by MinIO |

## Notifications

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `EMAIL_DRIVER` | no | `console` | `console` or `smtp` |
| `SMTP_URL` | smtp | | `smtp://user:pass@host:587` or `smtps://` |
| `EMAIL_FROM` | smtp | | sender address |
| `SLACK_DRIVER` | no | `console` | `console` or `bot` |
| `SLACK_BOT_TOKEN` | bot | | `xoxb-...` with `chat:write` |
| `SLACK_DEFAULT_CHANNEL` | bot | | channel id or name |

## Observability

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SENTRY_DSN` | no | | enables the Sentry error reporter driver (`npm install @sentry/node`) |
| `AUDIT_RETENTION_DAYS` | no | | when set, enables pruning of audit rows |

## Integrations

Each integration declares its own variables in its `index.ts` and lists them here
under a heading with its name. The template ships one:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `EXAMPLE_VENDOR_API_KEY` | no | | enables the example integration |
| `EXAMPLE_VENDOR_BASE_URL` | no | `https://example.invalid` | |
| `EXAMPLE_VENDOR_WEBHOOK_SECRET` | with key | | HMAC secret for inbound webhooks |
