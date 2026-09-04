import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiRequestError, setUnauthorizedHandler } from '@/client/platform/api/client';
import type { CurrentUser, MeResponse } from '@/shared/auth';
import type { Permission } from '@/shared/permissions';

// One `GET /api/me` for the whole app. `null` data means "definitely signed out";
// a 401 from any other call resets this query, which makes RequireAuth redirect.

export const meQueryKey = ['me'] as const;

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

interface SessionContextValue {
  user: CurrentUser | null;
  permissions: Permission[];
  status: SessionStatus;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function fetchMe(): Promise<MeResponse | null> {
  try {
    // skipUnauthorized: a 401 here is the normal answer for a signed-out visitor.
    return await api<MeResponse>('/api/me', { skipUnauthorized: true });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60_000,
  });

  // A 401 on any authenticated call means the session is gone. Dropping the cached
  // session to `null` is enough: RequireAuth sees `anonymous` and redirects.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.setQueryData(meQueryKey, null);
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: meQueryKey });
  }, [queryClient]);

  const logoutMutation = useMutation({
    mutationFn: () => api<void>('/api/auth/logout', { method: 'POST' }),
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      queryClient.setQueryData(meQueryKey, null);
      // Everything else in the cache belonged to the session that just ended.
      queryClient.removeQueries({ predicate: (query) => query.queryKey !== meQueryKey });
    }
  }, [logoutMutation, queryClient]);

  const value = useMemo<SessionContextValue>(() => {
    const status: SessionStatus = me.isPending
      ? 'loading'
      : me.data
        ? 'authenticated'
        : 'anonymous';
    return {
      user: me.data?.user ?? null,
      permissions: me.data?.permissions ?? [],
      status,
      refresh,
      logout,
    };
  }, [me.isPending, me.data, refresh, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider.');
  return context;
}

/**
 * Hides controls the user cannot use. Convenience only: the server checks the same
 * permission on every route, and that is the security boundary.
 */
export function usePermission(permission: Permission): boolean {
  const { permissions } = useSession();
  return permissions.includes(permission);
}
