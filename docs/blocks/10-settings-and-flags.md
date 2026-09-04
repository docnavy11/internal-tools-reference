# 10 Settings and feature flags

Runtime-editable behaviour, typed in code, stored in Postgres, edited by admins.

## Model

`settings`
- `key text pk`, `value jsonb not null`, `updated_by uuid null fk users`,
  `updated_at`

Registry in code, `src/server/platform/settings/registry.ts`, extended by features:

```ts
export const settings = defineSettings({
  'customers.slack_on_create': { schema: z.boolean(), default: true,
    label: 'Post to Slack when a customer is created', group: 'Customers' },
  'customers.default_plan': { schema: z.enum(['free', 'pro']), default: 'free',
    label: 'Default plan for new customers', group: 'Customers' },
});
const on = await settings.get('customers.slack_on_create');
```

- `get(key)` returns the typed value: stored value if present and valid, else the
  default. Values are cached in process memory and refreshed every 30 seconds or on
  `set` in the same process. Multi-process deployments accept up to 30 seconds of
  staleness.
- `set(key, value, ctx)` validates, writes, audits `settings.update` with before
  and after.
- Feature flags are boolean settings. There is no separate flag system.
- Secrets never go here. If a value would be a secret, it is an env var.

## API and page

- `GET /api/settings` returns all registry entries with current values and metadata,
  permission `settings:manage`. `PATCH /api/settings/:key`.
- `/settings/general` page renders the registry grouped by `group`, choosing a
  control from the Zod type the same way the filter bar does. No per-setting UI code.

## Settings area navigation

`/settings` is the admin area with sub-pages: General (this block), Users (02),
Jobs (06), Webhooks (07), Audit (05), Files (09). Each is gated by its permission.

## As built (phase 6, server)

- `platform/settings/`: `registry.ts` (`defineSetting`, `defineSettings` with typed
  results, `settingType` derives the UI control from the Zod schema), `service.ts`
  (`getSetting(def)` typed, 30 s process cache, invalidated on write; `setSetting` validates,
  upserts or deletes on `null`, audits `settings.update`; a stored value that no longer
  fits the schema falls back to the default with a warning), `routes.ts`.
- Features declare settings in `features/<name>/settings.ts` and that file is imported by
  `features/index.ts`. Customers has `customers.slack_on_create`, `customers.default_plan`,
  `customers.trash_days`; the follow-up job and the purge job read them.

## As built (phase 6, client)

- `/settings/general` (`pages/settings/general*.tsx`): one card per group, control chosen
  by `type` (switch, select, number, text), inline validation message from the server,
  "Default: …" hint and "Reset to default" when overridden, who changed it and when.
- `/settings` redirects to the first settings entry the user may see; General sorts first.

## Done when

- Golden example reads a setting to decide whether to post to Slack.
- Tests: default returned when unset, invalid stored value falls back and logs,
  set is audited, cache refresh.
