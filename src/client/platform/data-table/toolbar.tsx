import type { Table } from '@tanstack/react-table';
import { DownloadIcon, SlidersHorizontalIcon } from 'lucide-react';
import { Button } from '@/client/platform/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/platform/ui/dropdown-menu';
import { DebouncedInput } from '@/client/platform/data-table/debounced-input';
import { ActiveFilterChips, FilterControls } from '@/client/platform/data-table/filter-bar';
import type { FilterDef } from '@/client/platform/data-table/types';
import type { ListParams } from '@/client/platform/data-table/use-list-params';

// Search, filters, column visibility and export. Every list gets the same row of
// controls in the same order, so a person who learns one list knows them all.
export function DataTableToolbar<T, K extends string>({
  table,
  list,
  filters,
  searchPlaceholder,
  exportUrl,
  exportLabel = 'Export CSV',
}: {
  table: Table<T>;
  list: ListParams<K>;
  filters: FilterDef<K>[];
  searchPlaceholder?: string;
  exportUrl?: (params: URLSearchParams) => string;
  exportLabel?: string;
}) {
  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide() && typeof column.columnDef.header === 'string');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {searchPlaceholder ? (
          <DebouncedInput
            type="search"
            aria-label="Search"
            placeholder={searchPlaceholder}
            className="h-8 w-56"
            value={list.q}
            onCommit={list.setQ}
          />
        ) : null}

        <FilterControls filters={filters} list={list} />

        <div className="ml-auto flex items-center gap-2">
          {hideableColumns.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <SlidersHorizontalIcon />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) => column.toggleVisibility(!!checked)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {String(column.columnDef.header)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {exportUrl ? (
            <Button
              variant="outline"
              size="sm"
              // A normal navigation, not fetch: the browser handles the attachment and
              // the cookie goes with it. The URL carries the current filters, so the
              // file matches what the table shows.
              onClick={() => window.location.assign(exportUrl(list.toSearchParams()))}
            >
              <DownloadIcon />
              {exportLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <ActiveFilterChips filters={filters} list={list} />
    </div>
  );
}
