import { Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import { RequireAuth, RequirePermission } from '@/client/platform/auth/require-auth';
import { AppShell } from '@/client/platform/shell/app-shell';
import { RouteErrorBoundary } from '@/client/platform/shell/error-boundary';
import { lazyPage } from '@/client/platform/shell/lazy-page';
import { LoadingPage, NotFoundPage } from '@/client/platform/shell/states';
// One import line per feature.
import { customerRoutes } from '@/client/features/customers/routes';

/**
 * Every page is a lazy chunk so the first load is the shell, the session and the router
 * rather than the whole application. `AppShell` renders the `Suspense` boundary the
 * authenticated pages fall back to; the login page carries its own, because it is
 * outside the shell.
 *
 * Every feature adds its routes here with one import line, and its nav entry to
 * `platform/shell/nav.ts`. `handle.title` is what the top-bar breadcrumb shows.
 */

const LoginPage = lazyPage(() => import('@/client/platform/auth/login-page'), 'LoginPage');
const HomePage = lazyPage(() => import('@/client/pages/home'), 'HomePage');
const SettingsLayout = lazyPage(() => import('@/client/pages/settings/layout'), 'SettingsLayout');
const SettingsIndexRedirect = lazyPage(
  () => import('@/client/pages/settings/layout'),
  'SettingsIndexRedirect',
);
const SettingsGeneralPage = lazyPage(
  () => import('@/client/pages/settings/general'),
  'SettingsGeneralPage',
);
const UsersPage = lazyPage(() => import('@/client/pages/settings/users'), 'UsersPage');
const AuditPage = lazyPage(() => import('@/client/pages/settings/audit'), 'AuditPage');
const JobsPage = lazyPage(() => import('@/client/pages/settings/jobs'), 'JobsPage');
const WebhooksPage = lazyPage(() => import('@/client/pages/settings/webhooks'), 'WebhooksPage');

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspense fallback={<LoadingPage />}>
        <LoginPage />
      </Suspense>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <HomePage />, handle: { title: 'Home' } },
      ...customerRoutes,
      {
        path: 'settings',
        element: <SettingsLayout />,
        handle: { title: 'Settings' },
        children: [
          { index: true, element: <SettingsIndexRedirect /> },
          {
            path: 'general',
            element: (
              <RequirePermission permission="settings:manage">
                <SettingsGeneralPage />
              </RequirePermission>
            ),
            handle: { title: 'General' },
          },
          {
            path: 'users',
            element: (
              <RequirePermission permission="users:manage">
                <UsersPage />
              </RequirePermission>
            ),
            handle: { title: 'Users' },
          },
          {
            path: 'audit',
            element: (
              <RequirePermission permission="audit:read">
                <AuditPage />
              </RequirePermission>
            ),
            handle: { title: 'Audit log' },
          },
          {
            path: 'jobs',
            element: (
              <RequirePermission permission="jobs:manage">
                <JobsPage />
              </RequirePermission>
            ),
            handle: { title: 'Jobs' },
          },
          {
            path: 'webhooks',
            element: (
              <RequirePermission permission="jobs:manage">
                <WebhooksPage />
              </RequirePermission>
            ),
            handle: { title: 'Webhooks' },
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
