import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiSend } from '@/client/platform/api/client';
import type { Page } from '@/shared/api-types';
import type {
  BulkResult,
  Customer,
  CustomerBulkInput,
  CustomerInput,
  CustomerPatch,
} from '@/shared/features/customers/schema';

/**
 * Server state for `/api/customers`. Every mutation invalidates the whole `customers`
 * key and the history key, so what a page shows is always what the server returned; no
 * cache is patched by hand.
 *
 * A new entity copies this file and changes the path, the types and the key.
 */

export const customersKey = ['customers'] as const;
export const customersListKey = [...customersKey, 'list'] as const;

export function fetchCustomerPage(search: URLSearchParams): Promise<Page<Customer>> {
  return api<Page<Customer>>(`/api/customers?${search.toString()}`);
}

/**
 * The CSV endpoint takes the same filters and ignores paging, so the file matches the
 * filtered list rather than the visible page.
 */
export function customersExportUrl(search: URLSearchParams): string {
  const params = new URLSearchParams(search);
  params.delete('page');
  params.delete('pageSize');
  params.set('format', 'csv');
  return `/api/customers?${params.toString()}`;
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: [...customersKey, 'one', id],
    queryFn: () => api<Customer>(`/api/customers/${id}`),
  });
}

function useCustomerMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customersKey });
      await queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useCreateCustomer() {
  return useCustomerMutation((input: CustomerInput) =>
    apiSend<Customer>('POST', '/api/customers', input),
  );
}

export function useUpdateCustomer(id: string) {
  return useCustomerMutation((input: CustomerPatch) =>
    apiSend<Customer>('PATCH', `/api/customers/${id}`, input),
  );
}

export function useDeleteCustomer() {
  return useCustomerMutation((id: string) => apiSend<void>('DELETE', `/api/customers/${id}`));
}

export function useRestoreCustomer() {
  return useCustomerMutation((id: string) =>
    apiSend<Customer>('POST', `/api/customers/${id}/restore`),
  );
}

export function useBulkCustomers() {
  return useCustomerMutation((input: CustomerBulkInput) =>
    apiSend<BulkResult>('POST', '/api/customers/bulk', input),
  );
}
