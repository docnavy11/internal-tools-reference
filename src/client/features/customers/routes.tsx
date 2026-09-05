import { Navigate, useParams, type RouteObject } from 'react-router';
import { RequirePermission } from '@/client/platform/auth/require-auth';
import { lazyPage } from '@/client/platform/shell/lazy-page';

/**
 * The feature's routes, added to `client/router.tsx` with one spread. Every route is
 * wrapped in `RequirePermission`, which renders the no-access page rather than
 * redirecting; the server checks the same permission on every request.
 *
 * Pages are lazy so each route is its own bundle chunk. `handle.title` is what the
 * breadcrumb shows. Editing happens on the detail page (`?edit=1`), not on a route of
 * its own; the old `/edit` address redirects there for bookmarks.
 */
const CustomersListPage = lazyPage(() => import('./list'), 'CustomersListPage');
const CustomerDetailPage = lazyPage(() => import('./detail'), 'CustomerDetailPage');
const CustomerCreatePage = lazyPage(() => import('./form'), 'CustomerCreatePage');

function EditRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={`/customers/${id}?edit=1`} replace />;
}

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
      { path: ':id/edit', element: <EditRedirect /> },
    ],
  },
];
