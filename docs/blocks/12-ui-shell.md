# 12 UI shell

The frame every page lives in, and the shared components that make pages look like
one product.

## Layout

- Left sidebar: tool name and logo slot, navigation groups, collapses to icons on
  narrow screens. Navigation is built from `nav.ts` registrations in each feature
  plus the built-in Settings group, filtered by permission.
- Top bar: breadcrumb from the route, command palette trigger, theme toggle, user
  menu (name, email, role, sign out).
- Content area with a max width and consistent padding. Pages start with
  `PageHeader` (title, description, actions).
- Toasts (shadcn `sonner`) for success and error feedback.
- Theme: light and dark via a class on `html`, stored in `localStorage`, default
  follows the system.

## Navigation registration

```ts
// client/features/customers/nav.ts
export const nav = { label: 'Customers', icon: Users, to: '/customers',
  permission: 'customers:read', group: 'main', order: 10 };
```

`client/router.tsx` imports each feature's routes and nav. Adding a feature is one
import line.

## Shared components (`client/platform/shell/`)

`client/platform/ui/` holds only what the shadcn CLI writes. Our own building blocks
live in `client/platform/shell/`: `PageHeader`, `EmptyState` (icon, title, description,
action), `ConfirmDialog` (promise-based `confirm()` helper), `StatusBadge` (maps an
enum to colour), `UserAvatar`, `RelativeTime` (with absolute time in a tooltip),
`CopyButton`, `LoadingPage`, `NotFoundPage`, `NoAccessPage`, `ErrorBoundary`.

## Command palette

`cmdk` through shadcn. Lists navigation entries and, per feature that opts in, a
search over its records (`GET /api/<plural>?q=&pageSize=5`). Keyboard shortcut
`Ctrl/Cmd+K`. Optional polish, last in the build order.

## Accessibility and behaviour

- All interactive elements keyboard reachable; shadcn primitives (Radix) supply
  focus management for dialogs and menus.
- Forms show field errors inline and a summary toast on server error.
- Destructive actions always confirm and state what will happen.
- Tables and long content scroll within their container; the page never scrolls
  horizontally.

## As built (phase 2)

- `client/platform/shell/`: `app-shell.tsx` (layout route with sidebar and top bar),
  `app-sidebar.tsx`, `breadcrumbs.tsx` (from `handle.title` on routes), `user-menu.tsx`,
  `theme.tsx` (`dark` class on `html`, localStorage, system default), `nav.ts`
  (registry), `page-header.tsx`, `empty-state.tsx`, `states.tsx`, `error-boundary.tsx`,
  `confirm-dialog.tsx`, `relative-time.tsx`, `user-avatar.tsx`.
- Two shadcn files were rewritten and will be reverted by `shadcn add --overwrite`:
  `ui/sonner.tsx` reads the shell's theme context instead of `next-themes`, and
  `hooks/use-mobile.ts` uses `useSyncExternalStore` to satisfy the react-hooks lint rule.
- Command palette (phase 7): `platform/shell/command-palette.tsx` with a registry
  (`palette-registry.ts`); `Ctrl/Cmd+K` or the top-bar button; lists permitted navigation
  entries and, from two characters, results from registered sources. A feature adds
  `features/<name>/palette.ts` calling `registerPaletteSource({ label, permission, search })`
  and one import line in `command-palette.tsx`. Built on Dialog and a roving-focus list; no
  `cmdk`.
- Code splitting (phase 7): pages are wrapped with `lazyPage(() => import(...), 'Export')`
  from `platform/shell/lazy-page.ts`; `AppShell`, `SettingsLayout` and the login route hold
  `Suspense` boundaries with `LoadingPage`. Main chunk 547 kB (176 kB gzip), the rest per
  route. The remaining main-chunk weight is react-dom, react-router, TanStack Query, the
  shell's Radix primitives and sonner, all needed before any route resolves. Because
  navigations are transitions, the previous page stays visible while a chunk loads;
  end-to-end tests wait for an element of the new page before interacting.
- Client errors: `platform/api/report-client-error.ts` posts uncaught errors, unhandled
  rejections and route-boundary errors to `/api/client-errors`, deduplicated for 10 s.

## Done when

- Golden example pages use only shell and kit components; no bespoke layout.
- Dark mode has no unreadable contrast on any built-in page.
- Playwright: navigation reaches every built-in page as admin; viewer sees only
  permitted entries.
