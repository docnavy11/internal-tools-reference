import { registerPaletteSource } from '@/client/platform/shell/palette-registry';
import { fetchCustomerPage } from '@/client/features/customers/api';

// The feature's one line in the command palette. A new entity copies this file and
// changes the label, the permission and the fetch; `command-palette.tsx` imports it.
registerPaletteSource({
  label: 'Customers',
  permission: 'customers:read',
  async search(query) {
    const page = await fetchCustomerPage(new URLSearchParams({ q: query, pageSize: '5' }));
    return page.items.map((customer) => ({
      id: customer.id,
      label: customer.name,
      description: customer.email ?? undefined,
      to: `/customers/${customer.id}`,
    }));
  },
});
