import { lazy, type ComponentType } from 'react';

/**
 * `React.lazy` for a module that exports its page by name rather than as default, which
 * is every page in this codebase. One call per route in `router.tsx` and in a feature's
 * `routes.tsx` is what puts that page in its own bundle chunk.
 *
 * The `Suspense` fallback lives in `AppShell` (and in `router.tsx` for the login page).
 */
export function lazyPage<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
): ComponentType {
  // The cast is only about the generic index: `name` is checked against the module's
  // exports at every call site, so a renamed page is a typecheck error, not a blank page.
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}
