import type { ColumnDef } from '@tanstack/react-table';
import { UsersIcon } from 'lucide-react';
import { useSession } from '@/client/platform/auth/session';
import { DataTable, useListParams, type FilterDef } from '@/client/platform/data-table';
import { PageHeader } from '@/client/platform/shell/page-header';
import { RelativeTime } from '@/client/platform/shell/relative-time';
import { Badge } from '@/client/platform/ui/badge';
import { userFilters, userSortColumns, type User } from '@/shared/features/users/schema';
import { roles, userStatuses } from '@/shared/permissions';
import {
  InviteUserDialog,
  RoleSelect,
  UserRowActions,
} from '@/client/pages/settings/users-actions';
import { fetchUserPage, usersListKey } from '@/client/pages/settings/users-api';

// The users admin list, on the same kit as every feature list: URL search params hold
// the list state, TanStack Query owns the data, DataTable renders it.

const filters: FilterDef<keyof typeof userFilters.shape & string>[] = [
  {
    type: 'select',
    key: 'role',
    label: 'Role',
    options: roles.map((role) => ({ value: role, label: role })),
  },
  {
    type: 'select',
    key: 'status',
    label: 'Status',
    options: userStatuses.map((status) => ({ value: status, label: status })),
  },
];

export function UsersPage() {
  const list = useListParams(userFilters, { defaultSort: 'createdAt', defaultOrder: 'desc' });
  const { user: currentUser } = useSession();

  // Built here rather than at module level because two cells need to know which row is
  // the signed-in user: the server refuses self role changes and self disable.
  const columns: ColumnDef<User>[] = [
    {
      id: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.email}
          {row.original.id === currentUser?.id ? (
            <span className="text-muted-foreground ml-2 text-xs">(you)</span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'name',
      header: 'Name',
      cell: ({ row }) => row.original.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'role',
      header: 'Role',
      cell: ({ row }) =>
        row.original.id === currentUser?.id ? (
          <Badge variant="secondary" className="capitalize">
            {row.original.role}
          </Badge>
        ) : (
          <RoleSelect user={row.original} isSelf={false} />
        ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'active' ? 'secondary' : 'destructive'}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: 'lastLoginAt',
      header: 'Last login',
      cell: ({ row }) => <RelativeTime value={row.original.lastLoginAt} fallback="Never" />,
    },
    {
      id: 'createdAt',
      header: 'Created',
      cell: ({ row }) => <RelativeTime value={row.original.createdAt} />,
    },
    {
      id: 'actions',
      enableHiding: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="text-right">
          <UserRowActions user={row.original} isSelf={row.original.id === currentUser?.id} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in, what they may do, and when they were last here."
        actions={<InviteUserDialog />}
      />
      <DataTable
        queryKey={usersListKey}
        fetchPage={fetchUserPage}
        exportUrl={(params) => `/api/users?${params.toString()}&format=csv`}
        columns={columns}
        list={list}
        sortColumns={userSortColumns}
        filters={filters}
        searchPlaceholder="Email or name"
        entityName="users"
        empty={{
          icon: UsersIcon,
          title: 'No users match',
          description: 'Try a different search or clear the filters.',
        }}
      />
    </>
  );
}
