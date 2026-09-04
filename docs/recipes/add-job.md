# Recipe: add a background job or schedule

Corrected against `src/server/features/customers/jobs.ts` and `import.ts` in phase 4.

1. In `src/server/features/<name>/jobs.ts`:

```ts
export const syncVendors = defineJob(
  'vendors.sync',
  z.object({ since: z.string().datetime().optional() }),
  async (payload, ctx) => {
    ctx.log.info('starting');
    // Writes go through withTransaction and recordAudit(tx, ctx.actor, ...).
    return { synced: 12 }; // stored as result, visible in the admin page
  },
  { maxAttempts: 3, timeoutMs: 5 * 60_000 },
);
```

   `ctx` carries `jobId`, `attempt`, a child `log`, a job `actor` for audit rows, and an
   `AbortSignal` that fires at the timeout. The schema may use `preprocess` and
   `default`; the payload is validated at enqueue and again when the job runs, so make
   preprocessors idempotent (an array must pass through an array).

2. Register by adding `import './<name>/jobs';` to the side-effect imports at the top of
   `src/server/features/index.ts`. That file is imported by both the web and the worker
   entry points, so both know the handler; `enqueue` validates against it.

3. Enqueue from a service, passing the transaction when the job depends on the write:

```ts
await enqueue(syncVendors, { since }, { tx, dedupeKey: 'vendors.sync' });
```

   `enqueue` returns `{ id, deduped }`. With a `dedupeKey`, a second call while a job with
   that key is pending or running is a no-op that returns the live job's id.

4. For a schedule, in the same file:

```ts
defineSchedule('vendors.nightly_sync', '0 3 * * *', syncVendors, {});
```

   The cron is validated at import time. The worker mirrors definitions into the
   `schedules` table at start; admins can disable a schedule or run it now from
   `/settings/jobs`.

5. Tests (`tests/server/<name>.test.ts` or `jobs.test.ts`): `await enqueue(...)`, then
   `const job = await claimOne(); await runJob(job)`, then assert on the row in `jobs`
   and on audit rows. Both functions take the test transaction through `getDb()`.
   Do not start `startWorker()` in tests.

6. Throwing `NonRetryableError` marks the job `dead` immediately. Anything else retries
   with backoff until `maxAttempts`, then `dead`. Return a JSON-serialisable value to
   have it stored as `result`.
