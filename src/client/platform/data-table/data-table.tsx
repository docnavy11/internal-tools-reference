import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type RowSelectionState,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InboxIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { errorMessage, errorRequestId, toastError } from '@/client/platform/api/errors';
import { useSession } from '@/client/platform/auth/session';
import { ConfirmDialog } from '@/client/platform/shell/confirm-dialog';
import { EmptyState } from '@/client/platform/shell/empty-state';
import { Button } from '@/client/platform/ui/button';
import { Checkbox } from '@/client/platform/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/platform/ui/dropdown-menu';
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
import { DataTableToolbar } from '@/client/platform/data-table/toolbar';
import type { BulkAction, FilterDef } from '@/client/platform/data-table/types';
import { pageSizeOptions, type ListParams } from '@/client/platform/data-table/use-list-params';
import type { Page } from '@/shared/api-types';

/**
 * The list view every entity uses. It owns the query (server-side paging, sorting and
 * filtering) and the selection; the page owns the columns, the filter definitions and
 * what the bulk actions do.
 *
 * Columns are plain TanStack column definitions. Give each one an `id` and a string
 * `header`: the header string is what the sort button and the column menu show, and the
 * `id` is what goes into `sort=` when the column is in `sortColumns`.
 */
export interface DataTableProps<T extends { id: string }, K extends string> {
  /** Query key prefix. The current search string is appended, so filters cache apart. */
  queryKey: readonly unknown[];
  fetchPage: (search: URLSearchParams) => Promise<Page<T>>;
  columns: ColumnDef<T>[];
  list: ListParams<K>;
  /** Column ids the server will sort by (the entity's sort allowlist). */
  sortColumns?: readonly string[];
  filters?: FilterDef<K>[];
  bulkActions?: BulkAction[];
  exportUrl?: (params: URLSearchParams) => string;
  rowHref?: (row: T) => string;
  searchPlaceholder?: string;
  /** Extra panel under a row, opened by a chevron. Used by the audit log for diffs. */
  expandable?: (row: T) => React.ReactNode;
  empty?: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode };
  /** Announced to screen readers and used in the "N selected" bar. */
  entityName?: string;
}

export function DataTable<T extends { id: string }, K extends string>({
  queryKey,
  fetchPage,
  columns,
  list,
  sortColumns = [],
  filters = [],
  bulkActions = [],
  exportUrl,
  rowHref,
  searchPlaceholder,
  expandable,
  empty,
  entityName = 'rows',
}: DataTableProps<T, K>) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { permissions } = useSession();

  const search = list.toSearchParams().toString();
  const query = useQuery({
    queryKey: [...queryKey, search],
    queryFn: () => fetchPage(new URLSearchParams(search)),
    placeholderData: keepPreviousData,
  });

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // A different page or filter is a different set of rows; keeping ticks would let a
  // bulk action hit records the user can no longer see.
  useEffect(() => {
    setRowSelection({});
    setExpandedId(null);
  }, [search]);

  const allowedBulkActions = bulkActions.filter(
    (action) => !action.permission || permissions.includes(action.permission),
  );
  const selectable = allowedBulkActions.length > 0;

  const tableColumns: ColumnDef<T>[] = [
    ...(selectable ? [selectColumn<T>()] : []),
    ...columns,
    ...(expandable ? [expandColumn<T>(expandedId, setExpandedId)] : []),
  ];

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  // TanStack Table returns fresh functions on every render, which the React Compiler
  // cannot memoize. That is how the library works and is the reason ARCHITECTURE picked
  // it; the table is re-created per render either way.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: items,
    columns: tableColumns,
    state: { rowSelection, columnVisibility },
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableRowSelection: selectable,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const columnCount = table.getVisibleLeafColumns().length;

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        list={list}
        filters={filters}
        searchPlaceholder={searchPlaceholder}
        exportUrl={exportUrl}
      />

      {selectedIds.length > 0 ? (
        <BulkActionBar
          actions={allowedBulkActions}
          ids={selectedIds}
          entityName={entityName}
          onDone={async () => {
            setRowSelection({});
            await queryClient.invalidateQueries({ queryKey });
          }}
          onClear={() => setRowSelection({})}
        />
      ) : null}

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const label = header.column.columnDef.header;
                  const sortable = sortColumns.includes(header.column.id);
                  return (
                    <TableHead key={header.id} className={sortable ? 'p-0' : undefined}>
                      {sortable && typeof label === 'string' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start rounded-none font-medium"
                          onClick={() => list.toggleSort(header.column.id)}
                          aria-label={`Sort by ${label}`}
                        >
                          {label}
                          {list.sort === header.column.id ? (
                            list.order === 'asc' ? (
                              <ArrowUpIcon />
                            ) : (
                              <ArrowDownIcon />
                            )
                          ) : null}
                        </Button>
                      ) : header.isPlaceholder ? null : (
                        flexRender(label, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {query.isPending ? (
              <LoadingRows columns={columnCount} />
            ) : query.isError ? (
              <TableRow>
                <TableCell colSpan={columnCount}>
                  <EmptyState
                    icon={AlertCircleIcon}
                    title={errorMessage(query.error, `Could not load ${entityName}.`)}
                    description={
                      errorRequestId(query.error)
                        ? `Request ${errorRequestId(query.error)}`
                        : undefined
                    }
                    action={
                      <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                        Try again
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount}>
                  <EmptyState
                    icon={empty?.icon ?? InboxIcon}
                    title={empty?.title ?? `No ${entityName} yet`}
                    description={empty?.description}
                    action={empty?.action}
                  />
                </TableCell>
              </TableRow>
            ) : (
              table
                .getRowModel()
                .rows.map((row) => (
                  <DataRow
                    key={row.id}
                    row={row}
                    href={rowHref?.(row.original)}
                    onOpen={(href) => void navigate(href)}
                    expanded={expandedId === row.id}
                    expandedContent={expandable?.(row.original)}
                    columnCount={columnCount}
                  />
                ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination list={list} total={total} shown={items.length} busy={query.isFetching} />
    </div>
  );
}

function DataRow<T>({
  row,
  href,
  onOpen,
  expanded,
  expandedContent,
  columnCount,
}: {
  row: Row<T>;
  href?: string;
  onOpen: (href: string) => void;
  expanded: boolean;
  expandedContent?: React.ReactNode;
  columnCount: number;
}) {
  return (
    <>
      <TableRow
        data-state={row.getIsSelected() ? 'selected' : undefined}
        className={href ? 'cursor-pointer' : undefined}
        onClick={
          href
            ? (event) => {
                // Let checkboxes, buttons and the name link do their own thing.
                if ((event.target as HTMLElement).closest('a,button,input,[role="checkbox"]'))
                  return;
                onOpen(href);
              }
            : undefined
        }
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
      {expanded && expandedContent ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={columnCount} className="bg-muted/40 p-4">
            {expandedContent}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function selectColumn<T>(): ColumnDef<T> {
  return {
    id: '__select',
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows on this page"
        checked={
          table.getIsAllRowsSelected()
            ? true
            : table.getIsSomeRowsSelected()
              ? 'indeterminate'
              : false
        }
        onCheckedChange={(checked) => table.toggleAllRowsSelected(!!checked)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(!!checked)}
      />
    ),
  };
}

function expandColumn<T extends { id: string }>(
  expandedId: string | null,
  setExpandedId: (id: string | null) => void,
): ColumnDef<T> {
  return {
    id: '__expand',
    enableHiding: false,
    header: () => <span className="sr-only">Details</span>,
    cell: ({ row }) => {
      const open = expandedId === row.id;
      return (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-expanded={open}
          aria-label={open ? 'Hide details' : 'Show details'}
          onClick={() => setExpandedId(open ? null : row.id)}
        >
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </Button>
      );
    },
  };
}

function LoadingRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 5 }, (_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: columns }, (_, cellIndex) => (
            <TableCell key={cellIndex}>
              <Skeleton className="h-4 w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function BulkActionBar({
  actions,
  ids,
  entityName,
  onDone,
  onClear,
}: {
  actions: BulkAction[];
  ids: string[];
  entityName: string;
  onDone: () => Promise<void>;
  onClear: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState<BulkAction | null>(null);

  const run = async (action: BulkAction) => {
    setPending(true);
    try {
      // The action reports its own success; the table refreshes, deselects and is the
      // one place that turns a failed bulk request into a toast.
      await action.onRun(ids);
      await onDone();
    } catch (error) {
      toastError(error, 'The bulk action failed.');
    } finally {
      setPending(false);
      setConfirming(null);
    }
  };

  return (
    <>
      <div className="bg-muted/50 flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2">
        <span className="text-sm font-medium" aria-live="polite">
          {ids.length} {ids.length === 1 ? 'row' : 'rows'} selected
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={pending}>
              Bulk actions
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {actions
              .filter((action) => !action.destructive)
              .map((action) => (
                <DropdownMenuItem
                  key={action.label}
                  onSelect={() => void run(action)}
                  disabled={pending}
                >
                  {action.label}
                </DropdownMenuItem>
              ))}
            {actions.some((action) => action.destructive) ? (
              <>
                <DropdownMenuSeparator />
                {actions
                  .filter((action) => action.destructive)
                  .map((action) => (
                    <DropdownMenuItem
                      key={action.label}
                      variant="destructive"
                      onSelect={() => setConfirming(action)}
                      disabled={pending}
                    >
                      {action.label}
                    </DropdownMenuItem>
                  ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={pending}>
          Clear selection
        </Button>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => setConfirming(open ? confirming : null)}
        title={`${confirming?.label ?? 'Run action'} on ${ids.length} ${entityName}?`}
        description={
          confirming?.confirmDescription ?? 'This affects every selected row and is audited.'
        }
        confirmLabel={confirming?.label ?? 'Confirm'}
        destructive
        busy={pending}
        onConfirm={() => {
          if (confirming) void run(confirming);
        }}
      />
    </>
  );
}

function Pagination<K extends string>({
  list,
  total,
  shown,
  busy,
}: {
  list: ListParams<K>;
  total: number;
  shown: number;
  busy: boolean;
}) {
  const lastPage = Math.max(1, Math.ceil(total / list.pageSize));
  const firstRow = total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const lastRow = Math.min(firstRow + shown - 1, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {total === 0 ? 'Nothing to show' : `Showing ${firstRow}–${lastRow} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Select
          value={String(list.pageSize)}
          onValueChange={(value) => list.setPageSize(Number(value))}
        >
          <SelectTrigger size="sm" className="w-28" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          disabled={list.page <= 1 || busy}
          onClick={() => list.setPage(list.page - 1)}
        >
          Previous
        </Button>
        <span className="text-muted-foreground text-sm">
          Page {list.page} of {lastPage}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={list.page >= lastPage || busy}
          onClick={() => list.setPage(list.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
