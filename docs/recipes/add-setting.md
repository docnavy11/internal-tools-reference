# Recipe: add a setting or feature flag

Target procedure, to be verified in phase 6.

1. Add an entry to the registry in `src/server/platform/settings/registry.ts` or,
   preferably, in the feature's `settings.ts` merged into the registry from its
   `index.ts`:

```ts
'vendors.auto_sync': { schema: z.boolean(), default: false,
  label: 'Automatically sync vendors nightly', group: 'Vendors' },
```

2. Read it where needed: `if (await settings.get('vendors.auto_sync')) { ... }`.

3. Nothing else. The settings page renders the control from the schema, and changes
   are audited automatically.

If the value is a secret, stop: it belongs in `env.ts`, not here.
