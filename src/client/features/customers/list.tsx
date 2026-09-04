import { Link } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { userOptionLabel } from '@/client/platform/api/user-options';
import { usePermission } from '@/client/platform/auth/session';
import {
  DataTable,
  useListParams,
  type BulkAction,
  type FilterDef,
} from '@/client/platform/data-table';
import { PageHeader } from '@/client/platform/shell/page-header';
import { RelativeTime } from '@/client/platform/shell/relative-time';
import { Badge } from '@/client/platform/ui/badge';
import { Button } from '@/client/platform/ui/button';
import {
  customerFilters,
  customerPlans,
  customerSortColumns,
  customerStatuses,
  type Customer,
  type CustomerStatus,
} from '@/shared/features/customers/schema';
import {
  customersExportUrl,
  customersListKey,
  fetchCustomerPage,
  useBulkCustomers,
} from '@/client/features/customers/api';
import { ImportCustomersDialog } from '@/client/features/customers/import-dialog';

/**
 * The golden example list page. A new entity copies this file and changes the schema
 * imports, the columns and the filter definitions. Everything else is the kit.
 */

const statusVariants: Record<CustomerStatus, 'default' | 'secondary' | 'destructive'> = {
  lead: 'secondary',
  active: 'default',
  churned: 'destructive',
};

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <Badge variant={statusVariants[status]} className="capitalize">
      {status}
    </Badge>
  );
}

// Column ids that appear in `customerSortColumns` get a sort button; the rest do not.
const columns: ColumnDef<Customer>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <Link
        to={`/customers/${row.original.id}`}
        className="font-medium hover:underline"
        // The row is clickable too; the link is what keyboard and screen readers use.
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    id: 'email',
    header: 'Email',
    cell: ({ row }) => row.original.email ?? <span className="text-muted-foreground">—</span>,
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <CustomerStatusBadge status={row.original.status} />,
  },
  {
    id: 'plan',
    header: 'Plan',
    cell: ({ row }) => <span className="capitalize">{row.original.plan}</span>,
  },
  {
    id: 'tags',
    header: 'Tags',
    cell: ({ row }) =>
      row.original.tags.length === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {row.original.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      ),
  },
  {
    id: 'owner',
    header: 'Owner',
    cell: ({ row }) =>
      row.original.owner ? (
        userOptionLabel(row.original.owner)
      ) : (
        <span className="text-muted-foreground">Nobody</span>
      ),
  },
  {
    // Derived on the server from the child entity, so it is not in the sort allowlist
    // and gets no sort button.
    id: 'notesCount',
    header: () => <div className="text-right">Notes</div>,
    cell: ({ row }) => <div className="text-right tabular-nums">{row.original.notesCount}</div>,
  },
  {
    id: 'createdAt',
    header: 'Created',
    cell: ({ row }) => <RelativeTime value={row.original.createdAt} />,
  },
];

const filters: FilterDef<keyof typeof customerFilters.shape & string>[] = [
  {
    type: 'multi-select',
    key: 'status',
    label: 'Status',
    options: customerStatuses.map((status) => ({ value: status, label: status })),
  },
  {
    type: 'multi-select',
    key: 'plan',
    label: 'Plan',
    options: customerPlans.map((plan) => ({ value: plan, label: plan })),
  },
  { type: 'user', key: 'ownerId', label: 'Owner' },
  { type: 'text', key: 'tag', label: 'Tag', placeholder: 'Tag' },
  { type: 'boolean', key: 'includeDeleted', label: 'Show deleted' },
];

export function CustomersListPage() {
  const list = useListParams(customerFilters, { defaultSort: 'createdAt', defaultOrder: 'desc' });
  const mayWrite = usePermission('customers:write');
  const bulk = useBulkCustomers();

  // One entry per value rather than a nested menu: the bulk bar stays a flat list of
  // things that will happen, which is easier to read and to test.
  const bulkActions: BulkAction[] = [
    ...customerStatuses.map((status) => ({
      label: `Set status: ${status}`,
      permission: 'customers:write' as const,
      onRun: async (ids: string[]) => {
        const { affected } = await bulk.mutateAsync({ action: 'set_status', ids, status });
        toast.success(`Set ${affected} ${affected === 1 ? 'customer' : 'customers'} to ${status}.`);
      },
    })),
    ...customerPlans.map((plan) => ({
      label: `Set plan: ${plan}`,
      permission: 'customers:write' as const,
      onRun: async (ids: string[]) => {
        const { affected } = await bulk.mutateAsync({ action: 'set_plan', ids, plan });
        toast.success(`Moved ${affected} ${affected === 1 ? 'customer' : 'customers'} to ${plan}.`);
      },
    })),
    {
      label: 'Delete',
      destructive: true,
      permission: 'customers:delete' as const,
      confirmDescription:
        'The records are soft deleted: they disappear from the list but can be restored.',
      onRun: async (ids: string[]) => {
        const { affected } = await bulk.mutateAsync({ action: 'delete', ids });
        toast.success(`Deleted ${affected} ${affected === 1 ? 'customer' : 'customers'}.`);
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="The golden example entity. Copy this feature when you add your own."
        actions={
          mayWrite ? (
            <>
              <ImportCustomersDialog />
              <Button asChild size="sm">
                <Link to="/customers/new">
                  <PlusIcon />
                  New customer
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <DataTable
        queryKey={customersListKey}
        fetchPage={fetchCustomerPage}
        columns={columns}
        list={list}
        sortColumns={customerSortColumns}
        filters={filters}
        bulkActions={bulkActions}
        exportUrl={customersExportUrl}
        rowHref={(customer) => `/customers/${customer.id}`}
        searchPlaceholder="Name or email"
        entityName="customers"
        empty={{
          icon: UsersIcon,
          title: 'No customers match',
          description: 'Change the filters, or add the first one.',
          action: mayWrite ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/customers/new">New customer</Link>
            </Button>
          ) : undefined,
        }}
      />
    </>
  );
}
