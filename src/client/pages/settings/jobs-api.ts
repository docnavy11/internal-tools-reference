import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiSend } from '@/client/platform/api/client';
import type { Page } from '@/shared/api-types';
import type { Job, Schedule } from '@/shared/jobs';

// Server state for /api/jobs and /api/schedules. Every mutation invalidates the whole
// `jobs` key, so a retry, a cancel or a "run now" is reflected by what the server
// returned rather than by a hand-patched cache.

export const jobsKey = ['jobs'] as const;
export const jobsListKey = [...jobsKey, 'list'] as const;
export const schedulesKey = ['schedules'] as const;

export function fetchJobPage(search: URLSearchParams): Promise<Page<Job>> {
  return api<Page<Job>>(`/api/jobs?${search.toString()}`);
}

/** The registered job names, for the name filter. They change only on deploy. */
export function useJobNames() {
  return useQuery({
    queryKey: [...jobsKey, 'names'],
    queryFn: () => api<string[]>('/api/jobs/names'),
    staleTime: 5 * 60_000,
  });
}

export function useJob(id: string | null) {
  return useQuery({
    queryKey: [...jobsKey, 'one', id],
    queryFn: () => api<Job>(`/api/jobs/${id}`),
    enabled: id !== null,
  });
}

function useJobsMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: jobsKey });
      await queryClient.invalidateQueries({ queryKey: schedulesKey });
    },
  });
}

export function useRetryJob() {
  return useJobsMutation((id: string) => apiSend<Job>('POST', `/api/jobs/${id}/retry`));
}

export function useCancelJob() {
  return useJobsMutation((id: string) => apiSend<Job>('POST', `/api/jobs/${id}/cancel`));
}

export function useSchedules() {
  return useQuery({
    queryKey: schedulesKey,
    queryFn: () => api<Schedule[]>('/api/schedules'),
  });
}

export function useSetScheduleEnabled() {
  return useJobsMutation(({ name, enabled }: { name: string; enabled: boolean }) =>
    apiSend<Schedule>('PATCH', `/api/schedules/${encodeURIComponent(name)}`, { enabled }),
  );
}

export function useRunSchedule() {
  return useJobsMutation((name: string) =>
    apiSend<Job>('POST', `/api/schedules/${encodeURIComponent(name)}/run`),
  );
}

/**
 * A job the worker has not finished with yet. The list polls while any visible row is
 * in one of these states and stops as soon as they are all terminal.
 */
export function isJobActive(job: Job): boolean {
  return job.status === 'pending' || job.status === 'running';
}
