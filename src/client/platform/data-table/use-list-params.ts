import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import type { z } from 'zod';

/**
 * List state lives in the URL so a view can be shared, bookmarked and reloaded
 * (ARCHITECTURE section 5). This hook is the only place that reads and writes those
 * parameters; `DataTable` and the page's query both go through it.
 *
 * The URL is the source of truth and holds raw strings, exactly as they travel to the
 * API. Multi-value filters are one comma-separated parameter (`status=lead,active`),
 * matching `csvArray` in `src/shared/query.ts`. The entity's Zod filter schema is used
 * for its key names only: parsing back into typed values would have to be undone again
 * to build the request, and the server validates the query anyway.
 */

export type SortOrder = 'asc' | 'desc';

export const pageSizeOptions = [25, 50, 100] as const;

export interface ListParamsOptions {
  /** Column used when the URL says nothing. Must be in the entity's sort allowlist. */
  defaultSort: string;
  defaultOrder?: SortOrder;
  defaultPageSize?: number;
}

export interface ListParams<K extends string> {
  page: number;
  pageSize: number;
  sort: string;
  order: SortOrder;
  q: string;
  /** Raw filter values from the URL, keyed by the filter schema's keys. */
  filters: Partial<Record<K, string>>;
  /** Filter keys that currently have a value, in schema order. */
  activeKeys: K[];
  setQ: (value: string) => void;
  setFilter: (key: K, value: string | readonly string[] | null) => void;
  setFilters: (patch: Partial<Record<K, string | readonly string[] | null>>) => void;
  clearFilters: () => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  /** Same column twice flips the direction; a new column starts ascending. */
  toggleSort: (column: string) => void;
  /** Everything the API needs: paging, sort, `q` and every active filter. */
  toSearchParams: (extra?: Record<string, string>) => URLSearchParams;
}

function toParamValue(value: string | readonly string[] | null): string | null {
  if (value === null) return null;
  if (Array.isArray(value)) return value.length ? value.join(',') : null;
  return (value as string) || null;
}

export function useListParams<TShape extends z.ZodRawShape>(
  filtersSchema: z.ZodObject<TShape>,
  options: ListParamsOptions,
): ListParams<Extract<keyof TShape, string>> {
  type K = Extract<keyof TShape, string>;
  const [searchParams, setSearchParams] = useSearchParams();

  // `q` is handled on its own (the search box), so it is never treated as a filter chip
  // even when the entity's schema declares it.
  const filterKeys = Object.keys(filtersSchema.shape).filter((key) => key !== 'q') as K[];
  // The schema is a module-level constant, so this string is stable; it stands in for
  // the array in dependency lists, which must hold simple expressions.
  const filterKeyList = filterKeys.join(',');

  const defaultPageSize = options.defaultPageSize ?? pageSizeOptions[0];
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSizeParam = Number(searchParams.get('pageSize') ?? '') || defaultPageSize;
  const pageSize = Math.min(200, Math.max(1, pageSizeParam));
  const sort = searchParams.get('sort') || options.defaultSort;
  const orderParam = searchParams.get('order');
  const order: SortOrder =
    orderParam === 'asc' || orderParam === 'desc' ? orderParam : (options.defaultOrder ?? 'asc');
  const q = searchParams.get('q') ?? '';

  const filters: Partial<Record<K, string>> = {};
  for (const key of filterKeys) {
    const value = searchParams.get(key);
    if (value) filters[key] = value;
  }
  const activeKeys = filterKeys.filter((key) => filters[key] !== undefined);

  // Anything that changes what is on the page returns to page 1; only paging itself
  // keeps the page number. `replace` keeps the back button useful.
  const update = useCallback(
    (patch: Record<string, string | null>, keepPage = false) => {
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
    },
    [setSearchParams],
  );

  const setQ = useCallback((value: string) => update({ q: value || null }), [update]);

  const setFilter = useCallback(
    (key: K, value: string | readonly string[] | null) => update({ [key]: toParamValue(value) }),
    [update],
  );

  const setFilters = useCallback(
    (patch: Partial<Record<K, string | readonly string[] | null>>) => {
      const flat: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(patch)) {
        flat[key] = toParamValue(value as string | readonly string[] | null);
      }
      update(flat);
    },
    [update],
  );

  const clearFilters = useCallback(() => {
    const cleared: Record<string, string | null> = { q: null };
    for (const key of filterKeys) cleared[key] = null;
    update(cleared);
    // filterKeys is rebuilt every render from the same schema; filterKeyList is what
    // actually decides whether this callback has to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update, filterKeyList]);

  const setPage = useCallback((next: number) => update({ page: String(next) }, true), [update]);

  const setPageSize = useCallback((size: number) => update({ pageSize: String(size) }), [update]);

  const toggleSort = useCallback(
    (column: string) =>
      update({ sort: column, order: sort === column && order === 'asc' ? 'desc' : 'asc' }),
    [update, sort, order],
  );

  const toSearchParams = useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort,
        order,
      });
      if (q) params.set('q', q);
      for (const key of filterKeys) {
        const value = searchParams.get(key);
        if (value) params.set(key, value);
      }
      for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
      return params;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, pageSize, sort, order, q, searchParams, filterKeyList],
  );

  return {
    page,
    pageSize,
    sort,
    order,
    q,
    filters,
    activeKeys,
    setQ,
    setFilter,
    setFilters,
    clearFilters,
    setPage,
    setPageSize,
    toggleSort,
    toSearchParams,
  };
}
