import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, api, apiSend } from '@/client/platform/api/client';
import { errorMessage } from '@/client/platform/api/errors';
import type { Setting } from '@/shared/settings';

// Server state for /api/settings. The list is the registry: short, fixed at deploy
// time and never paged, so the whole thing is one query and a save patches the single
// row the server sent back rather than refetching everything.

export const settingsKey = ['settings'] as const;

export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => api<Setting[]>('/api/settings'),
  });
}

/**
 * One mutation per row, so `isPending` is that row's saving state. `value: null`
 * removes the override and the server answers with the setting back on its default.
 */
export function useSaveSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      apiSend<Setting>('PATCH', `/api/settings/${encodeURIComponent(key)}`, { value }),
    onSuccess: (saved) => {
      queryClient.setQueryData<Setting[]>(settingsKey, (current) =>
        current?.map((setting) => (setting.key === saved.key ? saved : setting)),
      );
    },
  });
}

/**
 * A rejected value is shown on the control, not in a toast, so the message has to be
 * the one the setting's own schema produced. The server sends Zod's `flatten()` output:
 * a setting is a single value rather than a form, so the message is in `formErrors`,
 * with `fieldErrors.value` covered too in case the body schema reported it there.
 */
export function settingErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.code === 'validation_error') {
    const details = error.details as { formErrors?: string[] } | undefined;
    const message = details?.formErrors?.[0] ?? error.fieldErrors.value?.[0];
    if (message) return message;
  }
  return errorMessage(error, 'That value could not be saved.');
}

/** How a value reads to a person: used by the "Default: …" hint. */
export function formatSettingValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (value === null || value === undefined) return 'not set';
  if (typeof value === 'string') return value === '' ? 'empty' : value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/** The value as it goes into a text or number input. */
export function settingInputText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}
