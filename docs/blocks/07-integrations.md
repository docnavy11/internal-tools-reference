# 07 Integrations

A fixed pattern for talking to vendor APIs and receiving their webhooks, so every
integration looks the same.

## Layout

```
src/server/integrations/<vendor>/
  client.ts     outbound: typed functions over a shared HTTP helper
  webhook.ts    inbound: signature verification, event mapping
  jobs.ts       processing jobs
  index.ts      registers webhook route and jobs
```

Secrets and base URLs come from `env.ts` (`<VENDOR>_API_KEY`, `<VENDOR>_BASE_URL`,
`<VENDOR>_WEBHOOK_SECRET`). An integration is enabled when its key is set;
otherwise its routes and jobs are not registered and the UI hides related actions.

## Outbound (`platform/http/vendor-client.ts`)

`createVendorClient({ name, baseUrl, headers, timeoutMs, retry })` returns
`get`, `post`, `patch`, `del` that:

- set auth headers, `Accept: application/json`, and a `User-Agent` naming the tool;
- time out (default 15s);
- retry on network errors, 429 and 5xx with exponential backoff and `Retry-After`
  respect, default 3 attempts, only for idempotent methods unless the caller passes
  an idempotency key;
- log one line per call with vendor, method, path, status, duration, request id,
  never logging bodies or headers;
- parse JSON and validate with a Zod schema passed by the caller, throwing
  `VendorError(vendor, status, body)` on failure.

Anything that changes vendor state is called from a job, so failures retry through
the jobs system rather than inside a request.

## Inbound (`platform/webhooks/`)

`webhook_events`
- `id uuid pk`, `vendor text`, `external_id text`, `event_type text`,
  `payload jsonb`, `headers jsonb`, `received_at`, `processed_at null`,
  `error text null`
- Unique `(vendor, external_id)`; if the vendor has no id, hash the raw body.

Route `POST /api/webhooks/<vendor>`:
1. Read the raw body. Verify the signature using the vendor's scheme (HMAC helper in
   `platform/webhooks/verify.ts` covering the common `sha256=` header pattern and a
   timestamp tolerance). Reject with 401 on failure.
2. Insert into `webhook_events`; on unique conflict respond 200 (duplicate delivery).
3. Enqueue `webhooks.process` with the event id. Respond 200 within milliseconds.

`webhooks.process` job dispatches to the vendor's `handleEvent(event)`, which does the
real work in a transaction with a `job` audit actor, then sets `processed_at`.

Rate limit per IP on webhook routes. Public route marker so the authz coverage test
knows these are intentionally unauthenticated.

## Admin page (`/settings/webhooks`, permission `jobs:manage`)

List events with vendor, type, received, processed, error. Replay button
re-enqueues processing.

## Golden example

`integrations/example-vendor`: an outbound `listWidgets()` against a fake base URL
covered by tests with a mocked `fetch`, and an inbound `widget.updated` webhook with
HMAC verification. Exists so the recipe points at real code.

## As built (phase 6, server)

- `platform/http/vendor-client.ts`: `createVendorClient({ name, baseUrl, headers, timeoutMs,
  retries, fetchImpl })` with `get/post/patch/del(path, { schema, body, query, idempotencyKey })`.
  Retries 408/425/429/5xx and network errors on idempotent calls (GET, HEAD, DELETE, or any
  method with an `idempotencyKey`), honours `Retry-After`, logs one line per attempt,
  throws `VendorError(vendor, status, body)`; status 0 means a network error or timeout.
- `platform/webhooks/`: `table.ts` (inbox with unique vendor + external id), `verify.ts`
  (`hmacSha256Header` with optional timestamp tolerance, `sharedTokenHeader`), `define.ts`
  (`defineWebhook`, `registerWebhook(api, def)` mounting `POST /api/webhooks/<vendor>` as a
  public, rate-limited route that verifies the raw body, stores, acknowledges duplicates
  with `{ ok, duplicate: true }`, and enqueues `webhooks.process`), `service.ts`,
  `routes.ts` (admin list/detail/replay/vendors behind `jobs:manage`).
- The processing job runs the vendor handler in its own transaction and records the
  outcome (processed, or error and attempts) on the row outside it, so a failed handler
  leaves a trace and its writes are rolled back.
- `integrations/example-vendor/`: `client.ts` (widgets), `webhook.ts` (HMAC over
  `${timestamp}.${body}`, `widget.failing` simulates a failure), `index.ts` registers only
  when `EXAMPLE_VENDOR_API_KEY` is set. `integrations/index.ts` is the registry.
- Not built: a webhook-specific admin for outbound calls; those are visible through jobs.

## Done when

- Tests: retry on 503 then success, no retry on 400, timeout raises, signature
  valid and invalid, duplicate delivery is idempotent, processing failure leaves
  `error` set and job retries.
