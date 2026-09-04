# 11 Observability

Enough to debug a production issue from logs alone, and a hook for an error tracker.

## Logging

- pino, JSON to stdout, level from `LOG_LEVEL` (default `info`). Pretty output in
  development through `pino-pretty` when `NODE_ENV !== 'production'`.
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

## Done when

- A failing request can be traced from the browser error page to the log line by
  request id.
- Tests: redaction of sensitive fields, `readyz` returns 503 with the database down,
  500 envelope contains request id but not the message of an unexpected error.
