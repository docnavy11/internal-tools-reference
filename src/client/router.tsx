import { createBrowserRouter } from 'react-router';
import { LoginPage } from '@/client/platform/auth/login-page';
import { RequireAuth, RequirePermission } from '@/client/platform/auth/require-auth';
import { AppShell } from '@/client/platform/shell/app-shell';
import { RouteErrorBoundary } from '@/client/platform/shell/error-boundary';
import { NotFoundPage } from '@/client/platform/shell/states';
import { HomePage } from '@/client/pages/home';
import { SettingsIndexRedirect, SettingsLayout } from '@/client/pages/settings/layout';
import { UsersPage } from '@/client/pages/settings/users';

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
      {
        path: 'settings',
        element: <SettingsLayout />,
        handle: { title: 'Settings' },
        children: [
          { index: true, element: <SettingsIndexRedirect /> },
          {
            path: 'users',
            element: (
              <RequirePermission permission="users:manage">
                <UsersPage />
              </RequirePermission>
            ),
            handle: { title: 'Users' },
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
