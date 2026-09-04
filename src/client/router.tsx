import { createBrowserRouter } from 'react-router';
import { LoginPage } from '@/client/platform/auth/login-page';
import { RequireAuth, RequirePermission } from '@/client/platform/auth/require-auth';
import { AppShell } from '@/client/platform/shell/app-shell';
import { RouteErrorBoundary } from '@/client/platform/shell/error-boundary';
import { NotFoundPage } from '@/client/platform/shell/states';
import { HomePage } from '@/client/pages/home';
import { SettingsIndexRedirect, SettingsLayout } from '@/client/pages/settings/layout';
import { UsersPage } from '@/client/pages/settings/users';
import { AuditPage } from '@/client/pages/settings/audit';
import { JobsPage } from '@/client/pages/settings/jobs';
import { SettingsGeneralPage } from '@/client/pages/settings/general';
import { WebhooksPage } from '@/client/pages/settings/webhooks';
// One import line per feature.
import { customerRoutes } from '@/client/features/customers/routes';

// Every feature adds its routes here with one import line, and its nav entry to
// `platform/shell/nav.ts`. `handle.title` is what the top-bar breadcrumb shows.
export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
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
