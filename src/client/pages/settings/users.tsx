import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowDownIcon, ArrowUpIcon, UsersIcon } from 'lucide-react';
import { useSession } from '@/client/platform/auth/session';
import { EmptyState } from '@/client/platform/shell/empty-state';
import { PageHeader } from '@/client/platform/shell/page-header';
import { RelativeTime } from '@/client/platform/shell/relative-time';
import { Badge } from '@/client/platform/ui/badge';
import { Button } from '@/client/platform/ui/button';
import { Input } from '@/client/platform/ui/input';
import { Label } from '@/client/platform/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/platform/ui/select';
import { Skeleton } from '@/client/platform/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/platform/ui/table';
import { userSortColumns, type User } from '@/shared/features/users/schema';
import { roles, userStatuses, type Role, type UserStatus } from '@/shared/permissions';
import {
  InviteUserDialog,
  RoleSelect,
  UserRowActions,
} from '@/client/pages/settings/users-actions';
import { useUsers, type UsersQuery, type UserSortColumn } from '@/client/pages/settings/users-api';

// The reference list page: URL search params hold every bit of list state, TanStack
// Query owns the data, plain shadcn table primitives do the rendering. Copy this shape
// for a feature list until the generic DataTable lands.

const PAGE_SIZE = 25;
const DEFAULT_SORT: UserSortColumn = 'createdAt';

const columns: { key: UserSortColumn | null; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'name', label: 'Name' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'lastLoginAt', label: 'Last login' },
  { key: 'createdAt', label: 'Created' },
  { key: null, label: 'Actions' },
];

function isSortColumn(value: string | null): value is UserSortColumn {
  return value !== null && (userSortColumns as readonly string[]).includes(value);
}

function oneOf<T extends string>(options: readonly T[], value: string | null): T | '' {
  return value !== null && (options as readonly string[]).includes(value) ? (value as T) : '';
}

export function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: currentUser } = useSession();

  const sortParam = searchParams.get('sort');
  const query: UsersQuery = {
    page: Math.max(1, Number(searchParams.get('page') ?? '1') || 1),
    pageSize: PAGE_SIZE,
    sort: isSortColumn(sortParam) ? sortParam : DEFAULT_SORT,
    order: searchParams.get('order') === 'asc' ? 'asc' : 'desc',
    q: searchParams.get('q') ?? '',
    role: oneOf<Role>(roles, searchParams.get('role')),
    status: oneOf<UserStatus>(userStatuses, searchParams.get('status')),
  };

  // Any filter change goes back to page 1; the page number itself passes `keepPage`.
  const setParams = (patch: Record<string, string | null>, keepPage = false) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        if (!keepPage) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  const users = useUsers(query);
  const items = users.data?.items ?? [];
  const total = users.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / query.pageSize));
  const firstRow = total === 0 ? 0 : (query.page - 1) * query.pageSize + 1;
  const lastRow = Math.min(query.page * query.pageSize, total);

  const toggleSort = (column: UserSortColumn) => {
    const order = query.sort === column && query.order === 'asc' ? 'desc' : 'asc';
    setParams({ sort: column, order });
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in, what they may do, and when they were last here."
        actions={<InviteUserDialog />}
      />

      <UserFilters query={query} onChange={setParams} />

      <div className="mt-4 overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.label} className={column.key ? 'p-0' : 'w-10'}>
                  {column.key ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start rounded-none font-medium"
                      onClick={() => toggleSort(column.key!)}
                      aria-label={`Sort by ${column.label}`}
                    >
                      {column.label}
                      {query.sort === column.key ? (
                        query.order === 'asc' ? (
                          <ArrowUpIcon />
                        ) : (
                          <ArrowDownIcon />
                        )
                      ) : null}
                    </Button>
                  ) : (
                    <span className="sr-only">{column.label}</span>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.isPending ? (
              <LoadingRows />
            ) : users.isError ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center">
                  <span className="text-destructive text-sm">
                    Could not load users. Refresh to try again.
                  </span>
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <EmptyState
                    icon={UsersIcon}
                    title="No users match"
                    description="Try a different search or clear the filters."
                  />
                </TableCell>
              </TableRow>
            ) : (
              items.map((user) => (
                <UserRow key={user.id} user={user} isSelf={user.id === currentUser?.id} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {total === 0 ? 'No users' : `Showing ${firstRow}–${lastRow} of ${total}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={query.page <= 1 || users.isPending}
            onClick={() => setParams({ page: String(query.page - 1) }, true)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={query.page >= lastPage || users.isPending}
            onClick={() => setParams({ page: String(query.page + 1) }, true)}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}

function UserRow({ user, isSelf }: { user: User; isSelf: boolean }) {
  return (
    <TableRow>
      <TableCell className="max-w-56 truncate font-medium" title={user.email}>
        {user.email}
        {isSelf ? <span className="text-muted-foreground ml-2 text-xs">(you)</span> : null}
      </TableCell>
      <TableCell>{user.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell>
        {isSelf ? (
          <Badge variant="secondary" className="capitalize">
            {user.role}
          </Badge>
        ) : (
          <RoleSelect user={user} isSelf={isSelf} />
        )}
      </TableCell>
      <TableCell>
        <Badge variant={user.status === 'active' ? 'secondary' : 'destructive'}>
          {user.status}
        </Badge>
      </TableCell>
      <TableCell>
        <RelativeTime value={user.lastLoginAt} fallback="Never" />
      </TableCell>
      <TableCell>
        <RelativeTime value={user.createdAt} />
      </TableCell>
      <TableCell className="text-right">
        <UserRowActions user={user} isSelf={isSelf} />
      </TableCell>
    </TableRow>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 5 }, (_, index) => (
        <TableRow key={index}>
          {columns.map((column) => (
            <TableCell key={column.label}>
              <Skeleton className="h-4 w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function UserFilters({
  query,
  onChange,
}: {
  query: UsersQuery;
  onChange: (patch: Record<string, string | null>) => void;
}) {
  const [search, setSearch] = useState(query.q);
  const [lastAppliedQ, setLastAppliedQ] = useState(query.q);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keeps the box in step with back/forward navigation. While typing this is a no-op:
  // query.q only changes once the debounce below has written it to the URL.
  if (query.q !== lastAppliedQ) {
    setLastAppliedQ(query.q);
    setSearch(query.q);
  }

  useEffect(() => () => clearTimeout(debounce.current), []);

  const onSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => onChange({ q: value }), 300);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1 space-y-2">
        <Label htmlFor="users-search">Search</Label>
        <Input
          id="users-search"
          type="search"
          placeholder="Email or name"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="users-role">Role</Label>
        <Select
          value={query.role || 'all'}
          onValueChange={(value) => onChange({ role: value === 'all' ? null : value })}
        >
          <SelectTrigger id="users-role" className="w-36 capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roles.map((role) => (
              <SelectItem key={role} value={role} className="capitalize">
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="users-status">Status</Label>
        <Select
          value={query.status || 'all'}
          onValueChange={(value) => onChange({ status: value === 'all' ? null : value })}
        >
          <SelectTrigger id="users-status" className="w-36 capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {userStatuses.map((status) => (
              <SelectItem key={status} value={status} className="capitalize">
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
