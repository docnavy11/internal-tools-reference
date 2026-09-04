import type { RouteObject } from 'react-router';
import { RequirePermission } from '@/client/platform/auth/require-auth';
import { lazyPage } from '@/client/platform/shell/lazy-page';

/**
 * The feature's routes, added to `client/router.tsx` with one spread. Every route is
 * wrapped in `RequirePermission`, which renders the no-access page rather than
 * redirecting; the server checks the same permission on every request.
 *
 * The pages are lazy, so the feature is its own bundle chunk and the shell does not pay
 * for it. `AppShell` supplies the `Suspense` fallback.
 *
 * `handle.title` is what the breadcrumb shows.
 */

const list = () => import('@/client/features/customers/list');
const form = () => import('@/client/features/customers/form');

const CustomersListPage = lazyPage(list, 'CustomersListPage');
const CustomerDetailPage = lazyPage(
  () => import('@/client/features/customers/detail'),
  'CustomerDetailPage',
);
const CustomerCreatePage = lazyPage(form, 'CustomerCreatePage');
const CustomerEditPage = lazyPage(form, 'CustomerEditPage');

export const customerRoutes: RouteObject[] = [
  {
    path: 'customers',
    handle: { title: 'Customers' },
    children: [
      {
        index: true,
        element: (
          <RequirePermission permission="customers:read">
            <CustomersListPage />
          </RequirePermission>
        ),
      },
      {
        path: 'new',
        handle: { title: 'New' },
        element: (
          <RequirePermission permission="customers:write">
            <CustomerCreatePage />
          </RequirePermission>
        ),
      },
      {
        path: ':id',
        handle: { title: 'Customer' },
        element: (
          <RequirePermission permission="customers:read">
            <CustomerDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: ':id/edit',
        handle: { title: 'Edit' },
        element: (
          <RequirePermission permission="customers:write">
            <CustomerEditPage />
          </RequirePermission>
        ),
      },
    ],
  },
];
