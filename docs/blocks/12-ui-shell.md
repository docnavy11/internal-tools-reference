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

## Shared components (`client/platform/ui/`)

Beyond shadcn primitives: `PageHeader`, `EmptyState` (icon, title, description,
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

## Done when

- Golden example pages use only shell and kit components; no bespoke layout.
- Dark mode has no unreadable contrast on any built-in page.
- Playwright: navigation reaches every built-in page as admin; viewer sees only
  permitted entries.
