# 02 Authorization

Role-based, with roles defined in code and checked on every route.

## Model

`src/shared/permissions.ts`

```ts
export const roles = ['admin', 'member', 'viewer'] as const;
export const permissions = [
  'users:manage', 'audit:read', 'jobs:manage', 'settings:manage', 'files:manage',
  'customers:read', 'customers:write', 'customers:delete',
  'notes:read', 'notes:write',
] as const;
export const rolePermissions: Record<Role, Permission[]> = {
  admin: [...permissions],
  member: ['customers:read', 'customers:write', 'notes:read', 'notes:write'],
  viewer: ['customers:read', 'notes:read'],
};
```

Permission strings are `<resource>:<verb>`. Verbs are `read`, `write`, `delete`,
`manage`. A feature adds its strings to this file; that is the only edit outside
its own folders.

## Server

- `requireAuth()` middleware: 401 if no session.
- `requirePermission(p)` middleware: 403 if the user's role lacks `p`. Used on every
  route except auth and health. A test walks all registered routes and fails if one
  under `/api` has neither `requirePermission` nor an explicit `publicRoute` marker.
- Services receive `ctx: { actor, requestId }` and may apply finer rules (for
  example, only the author or an admin may edit a note). These live in the service,
  not in middleware, and throw `AppError('forbidden', 403)`.

## Client

- `usePermission('customers:write')` returns a boolean; used to hide buttons and
  nav entries. Never treated as security.
- Routes may declare a required permission in `nav.ts`; the shell filters navigation
  and renders a "no access" page for direct URL hits.

## Users admin page (`/settings/users`, permission `users:manage`)

List users with role and status. Invite by email with a role. Change role. Disable
and re-enable. Revoke sessions. Every action audited.

## As built (phase 2)

- `requireAuth()`, `requirePermission()` and `publicRoute()` live in
  `platform/auth/middleware.ts` and tag their handlers; `tests/server/authz-coverage.test.ts`
  walks `app.routes` and fails on any `/api` endpoint without a tag.
- Users admin API in `platform/users/`: the last-admin check locks all active admin rows
  (`FOR UPDATE`) so two concurrent demotions cannot both pass; service guards `self_change` (an admin cannot
  change their own role or status) and `last_admin` (the last active admin cannot be
  demoted or disabled; reachable only with a non-user actor today, kept as defence in
  depth). Disabling revokes sessions. Every action audited.
- Client: `RequireAuth`, `RequirePermission`, `usePermission` in `client/platform/auth/`;
  the navigation registry hides entries by permission. Users page at `/settings/users`
  uses plain shadcn table primitives until the phase 3 DataTable exists.

## Done when

- Route coverage test passes.
- Tests: viewer gets 403 on write, member cannot reach users page, admin can.
- Golden example uses `requirePermission` on every route.
