import { Navigate, useLocation } from 'react-router';
import { useSession, usePermission } from '@/client/platform/auth/session';
import { loginPathFor } from '@/client/platform/auth/redirect';
import { LoadingPage, NoAccessPage } from '@/client/platform/shell/states';
import type { Permission } from '@/shared/permissions';

/** Wraps every authenticated route. Anonymous visitors go to /login and come back. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const location = useLocation();

  if (status === 'loading') return <LoadingPage label="Checking your session" />;
  if (status === 'anonymous') {
    return <Navigate to={loginPathFor(`${location.pathname}${location.search}`)} replace />;
  }
  return <>{children}</>;
}

/**
 * Direct URL hits on a page the user may not see render the no-access page. No
 * redirect: the address stays put so the user can see what they asked for.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: React.ReactNode;
}) {
  return usePermission(permission) ? <>{children}</> : <NoAccessPage />;
}
