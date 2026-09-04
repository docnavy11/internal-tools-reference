# Recipe: add a vendor integration

Corrected against `src/server/integrations/example-vendor/` in phase 6. Copy that folder.

1. Env: add `<VENDOR>_API_KEY`, `<VENDOR>_BASE_URL`, `<VENDOR>_WEBHOOK_SECRET` to
   `src/server/env.ts` (`optionalString()` for the secrets, a `z.string().url()` with a
   default for the URL, and a `.refine` that requires the webhook secret when the key is
   set), to `.env.example`, and to `docs/CONFIG.md`. The integration is enabled when the
   key is present.

2. `src/server/integrations/<vendor>/client.ts`:

```ts
export function acmeClient(fetchImpl?: typeof fetch) {
  const http = createVendorClient({
    name: 'acme',
    baseUrl: env.ACME_BASE_URL,
    headers: { authorization: `Bearer ${env.ACME_API_KEY ?? ''}` },
    fetchImpl, // tests pass a fake fetch
  });
  return {
    listWidgets: () => http.get('widgets', { schema: z.array(widgetSchema) }),
    renameWidget: (id: string, name: string, idempotencyKey: string) =>
      http.patch(`widgets/${encodeURIComponent(id)}`, { schema: widgetSchema, body: { name }, idempotencyKey }),
  };
}
```

   Calls that change vendor state go in a job (`jobs.ts`), never in a request handler, and
   carry an `idempotencyKey` so retries are safe.

3. Inbound, `webhook.ts`, returning a `WebhookDefinition`:

```ts
export function acmeWebhook(): WebhookDefinition {
  return {
    vendor: 'acme',
    verify: hmacSha256Header({ header: 'x-acme-signature', prefix: 'sha256=', secret: env.ACME_WEBHOOK_SECRET ?? '' }),
    externalId: (payload) => (payload as { id?: string })?.id,
    eventType: (payload) => (payload as { type?: string })?.type,
    async handle(event, { tx, actor }) {
      // validate event.payload with Zod, then write through tx with audit rows
    },
  };
}
```

   Add `timestampHeader` and `toleranceSeconds` when the vendor signs a timestamp too.
   Throw from `handle` to have the job retry; the row keeps the error and attempt count.

4. `index.ts`: `if (!env.ACME_API_KEY) return; registerWebhook(api, acmeWebhook());` and one
   line in `src/server/integrations/index.ts`.

5. Tests (`tests/server/<vendor>.test.ts`, copy `webhooks.test.ts` and `vendor-client.test.ts`):
   set `env.ACME_API_KEY`/secret before `createApp()`; post signed and unsigned bodies;
   drain jobs with `drainJobs()`; mock `fetch` for the client.

6. The webhooks admin page (`/settings/webhooks`) shows the inbox for every vendor with
   replay; nothing to add on the client.
