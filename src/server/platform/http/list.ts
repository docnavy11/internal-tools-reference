import type { SQL } from 'drizzle-orm';
import { asc, desc, type AnyColumn } from 'drizzle-orm';
import type { z } from 'zod';
import { listParamsSchema, type ListParams, type Page } from '../../../shared/api-types';
import { badRequest } from './errors';

// Parse page/pageSize/sort/order plus entity filters from a query string object.
export function parseListQuery<F extends z.ZodTypeAny>(
  query: Record<string, string | undefined>,
  filters: F,
  sortColumns: readonly string[],
): ListParams & z.infer<F> {
  const base = listParamsSchema.safeParse(query);
  if (!base.success) throw badRequest('Invalid list parameters', base.error.flatten());
  const extra = filters.safeParse(query);
  if (!extra.success) throw badRequest('Invalid filters', extra.error.flatten());
  if (base.data.sort && !sortColumns.includes(base.data.sort)) {
    throw badRequest(`Cannot sort by ${base.data.sort}`, { sortColumns });
  }
  return { ...base.data, ...extra.data };
}

export function orderBy(
  params: ListParams,
  columns: Record<string, AnyColumn>,
  fallback: AnyColumn,
): SQL {
  const column = (params.sort && columns[params.sort]) || fallback;
  return params.order === 'desc' ? desc(column) : asc(column);
}

export function offset(params: ListParams): number {
  return (params.page - 1) * params.pageSize;
}

export function page<T>(items: T[], total: number, params: ListParams): Page<T> {
  return { items, total, page: params.page, pageSize: params.pageSize };
}
