import type { Permission } from '@/shared/permissions';

// What a list page declares. Everything here is data, not JSX: the toolbar decides how
// to render each control so every list looks and behaves the same.

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * One control in the filter bar. `key` (or `fromKey`/`toKey`) must be a key of the
 * entity's Zod filter schema, which is what `useListParams` reads from the URL.
 *
 * - `text`: free text, debounced like the search box.
 * - `select`: one value from a short list.
 * - `multi-select`: several values, sent as one comma-separated parameter.
 * - `user`: one colleague, from `/api/users/options`.
 * - `boolean`: on or off; on sets the parameter to `true`, off removes it.
 * - `date-range`: two parameters holding ISO datetimes, picked as whole days.
 */
export type FilterDef<K extends string = string> =
  | { type: 'text'; key: K; label: string; placeholder?: string }
  | { type: 'select'; key: K; label: string; options: FilterOption[] }
  | { type: 'multi-select'; key: K; label: string; options: FilterOption[] }
  | { type: 'user'; key: K; label: string }
  | { type: 'boolean'; key: K; label: string }
  | { type: 'date-range'; fromKey: K; toKey: K; label: string };

export function filterKeysOf<K extends string>(filter: FilterDef<K>): K[] {
  return filter.type === 'date-range' ? [filter.fromKey, filter.toKey] : [filter.key];
}

/**
 * An action offered when rows are selected. `onRun` gets the selected ids and should
 * do one request; `DataTable` clears the selection and refetches when it resolves.
 * `permission` hides the action for users who lack it (the server checks too).
 */
export interface BulkAction {
  label: string;
  onRun: (ids: string[]) => Promise<unknown>;
  destructive?: boolean;
  permission?: Permission;
  /** Shown in the confirmation dialog destructive actions always get. */
  confirmDescription?: string;
}
