import type { RouteObject } from 'react-router';
import { RequirePermission } from '@/client/platform/auth/require-auth';
import { CustomerDetailPage } from '@/client/features/customers/detail';
import { CustomerCreatePage, CustomerEditPage } from '@/client/features/customers/form';
import { CustomersListPage } from '@/client/features/customers/list';

/**
 * The feature's routes, added to `client/router.tsx` with one spread. Every route is
 * wrapped in `RequirePermission`, which renders the no-access page rather than
 * redirecting; the server checks the same permission on every request.
 *
 * `handle.title` is what the breadcrumb shows.
 */
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
