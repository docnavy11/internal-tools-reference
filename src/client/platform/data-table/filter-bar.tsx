import { useState } from 'react';
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import { cn } from '@/client/lib/utils';
import { useUserOptions, userOptionLabel } from '@/client/platform/api/user-options';
import { Badge } from '@/client/platform/ui/badge';
import { Button } from '@/client/platform/ui/button';
import { Checkbox } from '@/client/platform/ui/checkbox';
import { Input } from '@/client/platform/ui/input';
import { Label } from '@/client/platform/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/client/platform/ui/popover';
import { ScrollArea } from '@/client/platform/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/platform/ui/select';
import { Toggle } from '@/client/platform/ui/toggle';
import { DebouncedInput } from '@/client/platform/data-table/debounced-input';
import type { FilterDef, FilterOption } from '@/client/platform/data-table/types';
import { filterKeysOf } from '@/client/platform/data-table/types';
import type { ListParams } from '@/client/platform/data-table/use-list-params';

// Dates travel as ISO datetimes because that is what the audit filters accept; the
// controls pick whole days in UTC, which is precise enough for a log filter and keeps
// the URL readable.
function dayToIso(day: string, endOfDay: boolean): string | null {
  if (!day) return null;
  const date = new Date(`${day}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isoToDay(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

function splitCsv(value: string | undefined): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

/** A popover with a checkbox per option, and a filter box once the list gets long. */
function OptionList({
  options,
  selected,
  multiple,
  onToggle,
  loading,
}: {
  options: FilterOption[];
  selected: string[];
  multiple: boolean;
  onToggle: (value: string) => void;
  loading?: boolean;
}) {
  const [search, setSearch] = useState('');
  const searchable = options.length > 8;
  const term = search.trim().toLowerCase();
  const shown = term
    ? options.filter((option) => option.label.toLowerCase().includes(term))
    : options;

  return (
    <div className="space-y-2">
      {searchable ? (
        <Input
          autoFocus
          type="search"
          placeholder="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-8"
        />
      ) : null}
      <ScrollArea className={cn(shown.length > 8 && 'h-56')}>
        <div className="space-y-0.5 pr-2">
          {loading ? (
            <p className="text-muted-foreground px-2 py-1.5 text-sm">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1.5 text-sm">Nothing matches</p>
          ) : (
            shown.map((option) => {
              const isSelected = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onToggle(option.value)}
                  className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                >
                  {multiple ? (
                    <Checkbox checked={isSelected} tabIndex={-1} className="pointer-events-none" />
                  ) : (
                    <CheckIcon className={cn('size-4', !isSelected && 'invisible')} />
                  )}
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function PopoverFilter({
  label,
  summary,
  active,
  onClear,
  children,
}: {
  label: string;
  summary: string | null;
  active: boolean;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn(active && 'border-primary/50')}>
          {label}
          {summary ? (
            <Badge variant="secondary" className="ml-1 font-normal">
              {summary}
            </Badge>
          ) : null}
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        {children}
        {active ? (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={onClear}>
            Clear
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function MultiSelectFilter<K extends string>({
  filter,
  list,
}: {
  filter: Extract<FilterDef<K>, { type: 'multi-select' }>;
  list: ListParams<K>;
}) {
  const selected = splitCsv(list.filters[filter.key]);
  const summary =
    selected.length === 0
      ? null
      : selected.length === 1
        ? (filter.options.find((option) => option.value === selected[0])?.label ?? selected[0]!)
        : `${selected.length}`;

  return (
    <PopoverFilter
      label={filter.label}
      summary={summary}
      active={selected.length > 0}
      onClear={() => list.setFilter(filter.key, null)}
    >
      <OptionList
        options={filter.options}
        selected={selected}
        multiple
        onToggle={(value) =>
          list.setFilter(
            filter.key,
            selected.includes(value)
              ? selected.filter((entry) => entry !== value)
              : [...selected, value],
          )
        }
      />
    </PopoverFilter>
  );
}

function UserFilter<K extends string>({
  filter,
  list,
}: {
  filter: Extract<FilterDef<K>, { type: 'user' }>;
  list: ListParams<K>;
}) {
  const users = useUserOptions();
  const selected = list.filters[filter.key];
  const options = (users.data ?? []).map((user) => ({
    value: user.id,
    label: userOptionLabel(user),
  }));
  const summary = selected
    ? (options.find((option) => option.value === selected)?.label ?? 'Selected')
    : null;

  return (
    <PopoverFilter
      label={filter.label}
      summary={summary}
      active={!!selected}
      onClear={() => list.setFilter(filter.key, null)}
    >
      <OptionList
        options={options}
        selected={selected ? [selected] : []}
        multiple={false}
        loading={users.isPending}
        onToggle={(value) => list.setFilter(filter.key, value === selected ? null : value)}
      />
    </PopoverFilter>
  );
}

function DateRangeFilter<K extends string>({
  filter,
  list,
}: {
  filter: Extract<FilterDef<K>, { type: 'date-range' }>;
  list: ListParams<K>;
}) {
  const from = isoToDay(list.filters[filter.fromKey]);
  const to = isoToDay(list.filters[filter.toKey]);
  const summary = from || to ? `${from || '…'} → ${to || '…'}` : null;

  return (
    <PopoverFilter
      label={filter.label}
      summary={summary}
      active={!!(from || to)}
      onClear={() => {
        const cleared: Partial<Record<K, null>> = {};
        cleared[filter.fromKey] = null;
        cleared[filter.toKey] = null;
        list.setFilters(cleared);
      }}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${filter.fromKey}-from`}>From</Label>
          <Input
            id={`${filter.fromKey}-from`}
            type="date"
            value={from}
            onChange={(event) =>
              list.setFilter(filter.fromKey, dayToIso(event.target.value, false))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${filter.toKey}-to`}>To</Label>
          <Input
            id={`${filter.toKey}-to`}
            type="date"
            value={to}
            onChange={(event) => list.setFilter(filter.toKey, dayToIso(event.target.value, true))}
          />
        </div>
      </div>
    </PopoverFilter>
  );
}

function FilterControl<K extends string>({
  filter,
  list,
}: {
  filter: FilterDef<K>;
  list: ListParams<K>;
}) {
  switch (filter.type) {
    case 'text':
      return (
        <DebouncedInput
          aria-label={filter.label}
          placeholder={filter.placeholder ?? filter.label}
          className="h-8 w-44"
          value={list.filters[filter.key] ?? ''}
          onCommit={(value) => list.setFilter(filter.key, value || null)}
        />
      );
    case 'select':
      return (
        <Select
          value={list.filters[filter.key] ?? 'all'}
          onValueChange={(value) => list.setFilter(filter.key, value === 'all' ? null : value)}
        >
          <SelectTrigger size="sm" className="w-44" aria-label={filter.label}>
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All {filter.label.toLowerCase()}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'multi-select':
      return <MultiSelectFilter filter={filter} list={list} />;
    case 'user':
      return <UserFilter filter={filter} list={list} />;
    case 'boolean':
      return (
        <Toggle
          size="sm"
          variant="outline"
          pressed={list.filters[filter.key] === 'true'}
          onPressedChange={(pressed) => list.setFilter(filter.key, pressed ? 'true' : null)}
        >
          {filter.label}
        </Toggle>
      );
    case 'date-range':
      return <DateRangeFilter filter={filter} list={list} />;
  }
}

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

/** One chip per active filter value, so the current query is readable at a glance. */
function useChips<K extends string>(filters: FilterDef<K>[], list: ListParams<K>): Chip[] {
  const users = useUserOptions();
  const chips: Chip[] = [];

  for (const filter of filters) {
    if (filter.type === 'date-range') {
      const from = isoToDay(list.filters[filter.fromKey]);
      const to = isoToDay(list.filters[filter.toKey]);
      if (from)
        chips.push({
          key: filter.fromKey,
          label: `${filter.label} from ${from}`,
          onRemove: () => list.setFilter(filter.fromKey, null),
        });
      if (to)
        chips.push({
          key: filter.toKey,
          label: `${filter.label} to ${to}`,
          onRemove: () => list.setFilter(filter.toKey, null),
        });
      continue;
    }

    const raw = list.filters[filter.key];
    if (!raw) continue;

    if (filter.type === 'multi-select') {
      const values = splitCsv(raw);
      for (const value of values) {
        chips.push({
          key: `${filter.key}:${value}`,
          label: `${filter.label}: ${filter.options.find((o) => o.value === value)?.label ?? value}`,
          onRemove: () =>
            list.setFilter(
              filter.key,
              values.filter((entry) => entry !== value),
            ),
        });
      }
      continue;
    }

    const label =
      filter.type === 'select'
        ? (filter.options.find((option) => option.value === raw)?.label ?? raw)
        : filter.type === 'user'
          ? (() => {
              const user = users.data?.find((entry) => entry.id === raw);
              return user ? userOptionLabel(user) : raw;
            })()
          : filter.type === 'boolean'
            ? 'on'
            : raw;

    chips.push({
      key: filter.key,
      label: `${filter.label}: ${label}`,
      onRemove: () => list.setFilter(filter.key, null),
    });
  }

  return chips;
}

export function FilterControls<K extends string>({
  filters,
  list,
}: {
  filters: FilterDef<K>[];
  list: ListParams<K>;
}) {
  return (
    <>
      {filters.map((filter) => (
        <FilterControl
          key={filter.type === 'date-range' ? filter.fromKey : filter.key}
          filter={filter}
          list={list}
        />
      ))}
    </>
  );
}

export function ActiveFilterChips<K extends string>({
  filters,
  list,
  searchLabel = 'Search',
}: {
  filters: FilterDef<K>[];
  list: ListParams<K>;
  searchLabel?: string;
}) {
  const chips = useChips(filters, list);
  const hasSearch = list.q.length > 0;
  if (chips.length === 0 && !hasSearch) return null;

  const clearAll = () => {
    const cleared: Partial<Record<K, null>> = {};
    for (const filter of filters) {
      for (const key of filterKeysOf(filter)) cleared[key] = null;
    }
    list.setFilters(cleared);
    list.setQ('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasSearch ? (
        <ChipBadge label={`${searchLabel}: ${list.q}`} onRemove={() => list.setQ('')} />
      ) : null}
      {chips.map((chip) => (
        <ChipBadge key={chip.key} label={chip.label} onRemove={chip.onRemove} />
      ))}
      <Button variant="ghost" size="sm" onClick={clearAll}>
        Clear all
      </Button>
    </div>
  );
}

function ChipBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="hover:text-foreground text-muted-foreground -mr-1 rounded-sm p-0.5"
      >
        <XIcon className="size-3" />
      </button>
    </Badge>
  );
}
