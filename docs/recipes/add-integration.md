# Recipe: add a vendor integration

Target procedure, to be verified in phase 6 against `integrations/example-vendor`.

1. Add env vars to `src/server/env.ts` and `.env.example`: `<VENDOR>_API_KEY`,
   `<VENDOR>_BASE_URL`, `<VENDOR>_WEBHOOK_SECRET` (all optional; the integration is
   enabled when the key is present). Document them in `../CONFIG.md`.

2. Create `src/server/integrations/<vendor>/client.ts`:

```ts
const http = createVendorClient({ name: 'acme', baseUrl: env.ACME_BASE_URL,
  headers: { authorization: `Bearer ${env.ACME_API_KEY}` } });

export async function listWidgets() {
  return http.get('/widgets', { schema: z.array(widgetSchema) });
}
```

3. Anything that writes to the vendor goes in `jobs.ts` and is enqueued, never
   called from a request handler.

4. Inbound, `webhook.ts`:

```ts
export const acmeWebhook = defineWebhook('acme', {
  verify: hmacSha256Header({ header: 'x-acme-signature', secret: env.ACME_WEBHOOK_SECRET }),
  externalId: (body) => body.id,
  eventType: (body) => body.type,
  handle: async (event, ctx) => { /* transaction, audit with ctx.actor */ },
});
```

5. `index.ts`: `if (env.ACME_API_KEY) { registerWebhook(app, acmeWebhook); registerJobs([...]); }`.
   Add one line to `src/server/integrations/index.ts`.

6. Tests: mock `fetch` for the client (success, 503 then success, 400), and post a
   signed and an unsigned payload to the webhook route.
