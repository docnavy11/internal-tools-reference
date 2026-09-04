# Recipe: add a setting or feature flag

Corrected against `src/server/features/customers/settings.ts` in phase 6.

1. In `src/server/features/<name>/settings.ts` (create it if the feature has none):

```ts
export const vendorSettings = defineSettings({
  'vendors.auto_sync': {
    schema: z.boolean(),
    default: false,
    label: 'Automatically sync vendors nightly',
    description: 'Runs the vendors.sync job from the nightly schedule.',
    group: 'Vendors',
  },
});
```

   Add `import './<name>/settings';` to the side-effect imports in
   `src/server/features/index.ts`.

2. Read it where needed, typed: `if (await getSetting(vendorSettings['vendors.auto_sync'])) { … }`.
   Values are cached per process for 30 seconds.

3. Nothing else. `/settings/general` renders the control from the schema (boolean, enum,
   number, string), changes are audited as `settings.update`, and `null` resets to the
   default.

If the value is a secret, stop: it belongs in `env.ts`, not here.
