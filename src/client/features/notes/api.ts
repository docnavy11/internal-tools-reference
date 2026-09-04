import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiSend, apiUpload } from '@/client/platform/api/client';
import type { Page } from '@/shared/api-types';
import type { Note } from '@/shared/features/notes/schema';
import { customersKey } from '@/client/features/customers/api';

/**
 * Server state for the notes of one customer. Notes are a child entity, so the key is
 * scoped by the parent id and every mutation invalidates two things: this customer's
 * notes, and the whole `customers` key, because `notesCount` on the parent record is
 * derived from them and the list and detail pages show it.
 *
 * A new child entity copies this file and changes the parent path, the types and the key.
 */

export const notesKey = ['notes'] as const;

export function notesListKey(customerId: string) {
  return [...notesKey, 'customer', customerId] as const;
}

/** Newest first, one page at a time; the tab appends pages behind a Load more button. */
export function useNotes(customerId: string, pageSize = 10) {
  return useInfiniteQuery({
    queryKey: [...notesListKey(customerId), pageSize],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchNotePage(customerId, pageParam, pageSize),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
}

export function fetchNotePage(
  customerId: string,
  page: number,
  pageSize: number,
): Promise<Page<Note>> {
  const search = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return api<Page<Note>>(`/api/customers/${customerId}/notes?${search.toString()}`);
}

function useNotesMutation<TVariables, TResult>(
  customerId: string,
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notesListKey(customerId) });
      // notesCount lives on the parent, so the customers list and detail are stale too.
      await queryClient.invalidateQueries({ queryKey: customersKey });
    },
  });
}

export interface CreateNoteInput {
  body: string;
  file: File | null;
}

/**
 * Multipart, because a note and its attachment are created together: one request, one
 * audit entry, no orphan file if the note fails to save.
 */
export function useCreateNote(customerId: string) {
  return useNotesMutation(customerId, ({ body, file }: CreateNoteInput) => {
    const form = new FormData();
    form.append('body', body);
    if (file) form.append('file', file);
    return apiUpload<Note>(`/api/customers/${customerId}/notes`, form);
  });
}

/** The body is the only editable part; an attachment is replaced by posting a new note. */
export function useUpdateNote(customerId: string) {
  return useNotesMutation(customerId, ({ id, body }: { id: string; body: string }) =>
    apiSend<Note>('PATCH', `/api/notes/${id}`, { body }),
  );
}

export function useDeleteNote(customerId: string) {
  return useNotesMutation(customerId, (id: string) => apiSend<void>('DELETE', `/api/notes/${id}`));
}
