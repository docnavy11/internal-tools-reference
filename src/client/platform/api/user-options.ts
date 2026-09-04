import { useQuery } from '@tanstack/react-query';
import { api } from '@/client/platform/api/client';
import type { UserOption } from '@/shared/features/users/schema';

/**
 * Colleagues, for owner and actor pickers. `GET /api/users/options` is open to any
 * signed-in user and returns only id, name and email; `/api/users` needs `users:manage`
 * and must not be used for pickers.
 */
export const userOptionsQueryKey = ['users', 'options'] as const;

export function useUserOptions() {
  return useQuery({
    queryKey: userOptionsQueryKey,
    queryFn: () => api<UserOption[]>('/api/users/options'),
    staleTime: 5 * 60_000,
  });
}

export function userOptionLabel(user: Pick<UserOption, 'name' | 'email'>): string {
  return user.name ?? user.email;
}
