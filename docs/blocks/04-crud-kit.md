# 04 CRUD kit

The reusable pieces that make an entity's list, detail and form mostly declarative.

## API contract for an entity

| Method and path | Purpose |
|---|---|
| `GET /api/<plural>?page&pageSize&sort&order&q&<filters>` | list, `{ items, total, page, pageSize }` |
| `GET /api/<plural>?format=csv&<same filters>` | stream all matching rows as CSV, ignores paging |
| `GET /api/<plural>/:id` | one record |
| `POST /api/<plural>` | create, body validated by `<name>Input` |
| `PATCH /api/<plural>/:id` | update, partial `<name>Input` |
| `DELETE /api/<plural>/:id` | soft delete |
| `POST /api/<plural>/bulk` | `{ ids, action, params? }`, actions defined per entity |
| `POST /api/<plural>/import` | multipart CSV, enqueues an import job, returns job id |
| `GET /api/<plural>/:id/history` | audit entries for this record |

Filters are declared in `<name>Filters` (Zod). Sort is restricted to an allowlist of
columns declared in `service.ts`.

## Server helpers (`platform/http/`, `platform/csv/`)

- `listQuery(filtersSchema)`: parses `page`, `pageSize`, `sort`, `order`, `q` plus
  the entity's filters from the query string.
- `csvStream(columns, rowsAsyncIterable)`: streams CSV with proper escaping,
  `Content-Disposition` filename with date.
- `parseCsv(file, rowSchema)`: parses with papaparse, validates each row with Zod,
  returns `{ valid, invalid: [{ row, errors }] }`.
- `importJob` pattern: the import job processes rows in batches inside transactions,
  records a summary on the job, and the UI shows the result.

## Client components (`client/platform/data-table/`, `client/platform/form/`)

`DataTable<T>`
- Props: `columns` (TanStack column defs), `queryKey`, `fetchPage(params)`,
  `filters` (a filter schema and UI definitions), `bulkActions`, `exportUrl`,
  `rowHref`.
- State (page, sort, filters, `q`) lives in URL search params via a
  `useListParams(filtersSchema)` hook.
- Renders: toolbar (search box, filter bar, export button, column visibility),
  table with sort headers and row selection, pagination footer, bulk action bar
  when rows are selected, empty state, loading skeleton, error state with retry.
- Filter bar controls are declared explicitly as a `FilterDef[]` in `list.tsx` (text,
  select, multi-select, user, boolean, date-range). The Zod filter schema supplies the
  key names and validates on the server; it does not drive the UI.

`EntityForm<TInput>`
- Wraps react-hook-form with the Zod resolver, maps server 400 `details` back onto
  fields, disables submit while pending, shows a toast on success.
- Field components in `client/platform/form/`: `TextField`, `TextareaField`,
  `SelectField`, `TagsField`, `CheckboxField`, `NumberField`, `UserPickerField`. Each
  takes `name` and `label` and binds itself through the form context. `FileField`
  arrives with storage in phase 5; a date field is added when an entity needs one.

`DetailPage`
- `PageHeader` with title, status badge, actions menu (edit, delete, custom).
- `FieldList` for read-only display of a record.
- `Tabs` with a `HistoryTab` that renders `/history` as a timeline with before and
  after diffs.

`ConfirmDialog`, `EmptyState`, `PageHeader` live in `client/platform/shell/`; status badges
are per entity (see `CustomerStatusBadge` in the customers list). `client/platform/ui/`
holds only shadcn output.

## As built (phase 3, server)

- `parseListQuery(query, filtersSchema, sortColumns)` in `platform/http/list.ts`;
  multi-value filters are comma-separated single parameters (`csvArray` in
  `src/shared/query.ts`).
- `csvResponse(c, filename, columns, asyncIterable)` in `platform/csv/stream.ts` streams
  rows in batches, prefixes cells starting with `= + - @` with an apostrophe (formula
  injection), joins arrays with `;`, and follows the list's `sort`/`order`.
- Bulk actions are a Zod discriminated union; each affected record gets its own audit
  row with `metadata.bulk` set, and no-op changes are skipped.
- `POST /:id/restore` complements soft delete. PATCH on a deleted record is 409 `deleted`.
- CSV import (`POST /import`) arrives with jobs in phase 4.

## As built (phase 3, client)

- `client/platform/data-table/`: `useListParams(filtersSchema, { defaultSort })` holds
  page, pageSize, sort, order, q and filters in URL search params (raw strings, comma
  lists for multi-value); `DataTable` owns its TanStack Query and takes `columns`,
  `filters: FilterDef[]` (text, select, multi-select, user, boolean, date-range),
  `bulkActions`, `exportUrl`, `rowHref`, `empty`. Sort buttons appear on columns whose
  id is in the sort allowlist.
- `client/platform/form/`: `EntityForm` (zod resolver, `fieldErrors` mapped with
  `setError`, root error for `formErrors`, toast with request id otherwise) and
  `TextField`, `TextareaField`, `SelectField`, `TagsField`, `CheckboxField`,
  `UserPickerField`, `NumberField`. Plain `Label` plus control; the shadcn `form`
  component does not exist in the radix-nova registry.
- `client/platform/detail/`: `DetailPage`, `FieldList`, `HistoryTab`, `AuditDiff`.
- Multi-select and user pickers are popover plus checkbox list; date ranges use native
  date inputs. `cmdk`, `react-day-picker` and `date-fns` were deliberately not added.

## Done when

- The `customers` golden example uses `DataTable`, `EntityForm` and `DetailPage`
  with no bespoke table or form code.
- CSV export of a filtered list matches the list. CSV import creates rows, reports
  invalid rows with line numbers.
- Bulk status change on selected rows works and is audited per row.
- Tests: list params parsing, sort allowlist enforced, CSV escaping, import row
  validation, PATCH with unknown fields ignored (Zod strips unknown keys so clients can
  send a whole record back; `tests/server/customers.test.ts` asserts this).
