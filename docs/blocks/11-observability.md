# 11 Observability

Enough to debug a production issue from logs alone, and a hook for an error tracker.

## Logging

- pino, JSON to stdout, level from `LOG_LEVEL` (default `info`). Pretty output
  through `pino-pretty` only when `NODE_ENV === 'development'`; tests run silent
  (`LOG_LEVEL=silent` in `vitest.config.ts`) and production stays JSON.
- Base fields: `service` (tool name from `APP_NAME`), `mode` (`web`, `worker`),
  `version` (git sha baked into the image as `APP_VERSION`).
- Request logger is a child with `requestId` and `userId`. One access line per
  request: method, path (route pattern, not raw URL, to avoid ids in aggregates),
  status, `durationMs`.
- Job logger is a child with `jobId`, `jobName`, `attempt`.
- Never log request bodies, headers, cookies, tokens or payloads containing them.
  A redaction list in the pino config covers `authorization`, `cookie`, `token`,
  `password`, `secret`.

## Request ids

Middleware reads `x-request-id` when present (platform load balancers usually set
one) or generates a UUID. It is echoed in the response header and included in every
error envelope so a user can quote it.

## Errors

- `AppError(code, status, message, details?)` for expected failures. Anything else
  is a 500 with a generic message and the request id; the real error is logged with
  stack.
- `errorReporter.report(err, context)` is called for 500s and job failures.
  Drivers: `console` (default) and `sentry`, enabled by `SENTRY_DSN`. The Sentry
  wiring is a single file so the SDK version is isolated and can be updated
  independently of everything else.
- Client: an error boundary renders a friendly page with the request id when the
  API returned one, and the SPA reports uncaught errors to `POST /api/client-errors`
  (rate limited, logs only) so front-end failures are visible server-side.

## Health

- `GET /healthz`: 200 when the process is up.
- `GET /readyz`: 200 after a successful `select 1`, 503 otherwise. Worker mode
  exposes the same on `HEALTH_PORT` so platforms can probe it.

## Metrics

Not in the template. Logs carry duration and status, which is enough to derive rates
and latencies in any log platform. A future ADR can add a `/metrics` endpoint if a
tool needs Prometheus.

## As built (phases 1 and 7)

- `platform/http/logger.ts` exports `loggerOptions` (redaction of authorization, cookie,
  token, password, secret paths) and the singleton `logger`; tests build a logger with a
  sink from the same options to prove redaction.
- `platform/http/error-reporter.ts`: `reportError(err, ctx)`; console driver by default,
  Sentry driver when `SENTRY_DSN` is set (dynamically imports `@sentry/node`, which is not
  a dependency of the template and must be installed by the tool that wants it). Called
  for 500s (`handleError`) and dead jobs (`runJob`). `initErrorReporter()` runs at boot.
- `platform/http/security-headers.ts`: CSP (`default-src 'self'`, inline style attributes
  allowed for UI primitives, `img-src https:` for identity-provider avatars,
  `frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, `Permissions-Policy`, HSTS on https.
- `POST /api/client-errors` (public, rate limited) logs SPA errors at warn with the
  session's user id when present.
- `createApp({ pingDatabase, testRoutes })` lets tests exercise the 503 and 500 paths.
- Request ids: inbound `x-request-id` is accepted only when it matches
  `[A-Za-z0-9._:-]{8,128}`; otherwise a UUID is minted.

## Done when

- A failing request can be traced from the browser error page to the log line by
  request id.
- Tests: redaction of sensitive fields, `readyz` returns 503 with the database down,
  500 envelope contains request id but not the message of an unexpected error.
