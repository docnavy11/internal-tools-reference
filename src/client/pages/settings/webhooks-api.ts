import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiSend } from '@/client/platform/api/client';
import type { Page } from '@/shared/api-types';
import type { Job } from '@/shared/jobs';
import type { WebhookEvent, WebhookEventDetail } from '@/shared/webhooks';
import { jobsKey } from '@/client/pages/settings/jobs-api';

// Server state for the inbound webhook inbox. A replay is a job, so it invalidates the
// jobs cache as well: the same action is visible on both admin pages.

export const webhooksKey = ['webhooks'] as const;
export const webhooksListKey = [...webhooksKey, 'list'] as const;

/** An event the worker has not finished with yet is worth another look. */
const POLL_MS = 5_000;

export function fetchWebhookPage(search: URLSearchParams): Promise<Page<WebhookEvent>> {
  return api<Page<WebhookEvent>>(`/api/webhooks?${search.toString()}`);
}

/** Vendors with a registered handler, for the filter. They change only on deploy. */
export function useWebhookVendors() {
  return useQuery({
    queryKey: [...webhooksKey, 'vendors'],
    queryFn: () => api<string[]>('/api/webhooks/vendors'),
    staleTime: 5 * 60_000,
  });
}

/**
 * The full event. It polls itself while the event is pending, so the panel follows a
 * replay through to its result even when the list underneath has stopped polling.
 */
export function useWebhookEvent(id: string | null) {
  return useQuery({
    queryKey: [...webhooksKey, 'one', id],
    queryFn: () => api<WebhookEventDetail>(`/api/webhooks/${id}`),
    enabled: id !== null,
    refetchInterval: (query) =>
      query.state.data && isWebhookPending(query.state.data) ? POLL_MS : false,
  });
}

export function useReplayWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<Job>('POST', `/api/webhooks/${id}/replay`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: webhooksKey });
      await queryClient.invalidateQueries({ queryKey: jobsKey });
    },
  });
}

export function isWebhookPending(event: WebhookEvent): boolean {
  return event.status === 'pending';
}

/** Polling for a page of events: on while anything on it is still moving. */
export function webhookPoll(page: Page<WebhookEvent> | undefined): number | false {
  return page?.items.some(isWebhookPending) ? POLL_MS : false;
}
