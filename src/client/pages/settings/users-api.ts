import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiSend, ApiRequestError } from '@/client/platform/api/client';
import type { Page } from '@/shared/api-types';
import type { InviteUserInput, UpdateUserInput, User } from '@/shared/features/users/schema';
import type { userSortColumns } from '@/shared/features/users/schema';
import type { Role, UserStatus } from '@/shared/permissions';

// Server state for /api/users. Every mutation invalidates the list; nothing is patched
// into the cache by hand, so what the table shows is always what the server returned.

export type UserSortColumn = (typeof userSortColumns)[number];

export interface UsersQuery {
  page: number;
  pageSize: number;
  sort: UserSortColumn;
  order: 'asc' | 'desc';
  q: string;
  role: Role | '';
  status: UserStatus | '';
}

const usersKey = ['users'] as const;

function toSearchParams(query: UsersQuery): string {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    sort: query.sort,
    order: query.order,
  });
  if (query.q) params.set('q', query.q);
  if (query.role) params.set('role', query.role);
  if (query.status) params.set('status', query.status);
  return params.toString();
}

export function useUsers(query: UsersQuery) {
  return useQuery({
    queryKey: [...usersKey, query],
    queryFn: () => api<Page<User>>(`/api/users?${toSearchParams(query)}`),
    placeholderData: keepPreviousData,
  });
}

function useUsersMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useInviteUser() {
  return useUsersMutation((input: InviteUserInput) => apiSend<User>('POST', '/api/users', input));
}

export function useUpdateUser() {
  return useUsersMutation(({ id, ...input }: UpdateUserInput & { id: string }) =>
    apiSend<User>('PATCH', `/api/users/${id}`, input),
  );
}

export function useRevokeSessions() {
  return useUsersMutation((id: string) =>
    apiSend<void>('POST', `/api/users/${id}/revoke-sessions`),
  );
}

const errorMessages: Record<string, string> = {
  last_admin: 'This would leave the tool without an active admin.',
  self_change: 'You cannot change your own role or disable yourself.',
  already_exists: 'A user with that email already exists.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
};

/** One place that turns the error envelope into something worth showing a person. */
export function describeApiError(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return 'Something went wrong. Please try again.';
  const fieldErrors = Object.entries(error.fieldErrors).flatMap(([field, messages]) =>
    (messages ?? []).map((message) => `${field}: ${message}`),
  );
  if (fieldErrors.length > 0) return fieldErrors.join('. ');
  return errorMessages[error.code] ?? error.message;
}
