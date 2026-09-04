# Recipe: add a background job or schedule

Target procedure, to be verified in phase 4 against `customers/jobs.ts`.

1. In `src/server/features/<name>/jobs.ts`:

```ts
export const syncVendors = defineJob(
  'vendors.sync',
  z.object({ since: z.string().datetime().optional() }),
  async (payload, ctx) => {
    ctx.log.info('starting');
    // work, using withTransaction and audit.record(tx, ctx.actor, ...) for writes
    return { synced: 12 }; // stored as result, visible in the admin page
  },
  { maxAttempts: 3, timeoutMs: 5 * 60_000 },
);
```

2. Register it in the feature's `index.ts` via `registerJobs([syncVendors])`. Jobs
   must be registered in both `web` and `worker` modes because `enqueue` validates
   the payload against the definition.

3. Enqueue from a service, inside the transaction when the job depends on the write:

```ts
await enqueue(syncVendors, { since }, { tx, dedupeKey: 'vendors.sync' });
```

4. For a schedule, in the same file:

```ts
defineSchedule('vendors.nightly_sync', '0 3 * * *', syncVendors, {});
```

5. Test the handler directly by calling `syncVendors.handler(payload, testCtx)`,
   and test enqueue-side behaviour through the service test. Do not test the worker
   loop again; it has its own tests.

6. Throwing `NonRetryableError` marks the job `dead` immediately. Anything else
   retries with backoff.
