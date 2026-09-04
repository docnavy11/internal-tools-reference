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
- Filter bar controls are chosen by Zod type: enum becomes a multi-select, boolean a
  toggle, date a range picker, string a text input. Declared once in `list.tsx`.

`EntityForm<TInput>`
- Wraps react-hook-form with the Zod resolver, maps server 400 `details` back onto
  fields, disables submit while pending, shows a toast on success.
- Field components in `client/platform/form/`: `TextField`, `TextareaField`,
  `SelectField`, `MultiSelectField`, `CheckboxField`, `DateField`, `NumberField`,
  `UserPickerField`, `FileField`. Each takes `name` and `label` and binds itself.

`DetailPage`
- `PageHeader` with title, status badge, actions menu (edit, delete, custom).
- `FieldList` for read-only display of a record.
- `Tabs` with a `HistoryTab` that renders `/history` as a timeline with before and
  after diffs.

`ConfirmDialog`, `EmptyState`, `PageHeader`, `StatusBadge` shared in `client/platform/ui/`.

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

## Done when

- The `customers` golden example uses `DataTable`, `EntityForm` and `DetailPage`
  with no bespoke table or form code.
- CSV export of a filtered list matches the list. CSV import creates rows, reports
  invalid rows with line numbers.
- Bulk status change on selected rows works and is audited per row.
- Tests: list params parsing, sort allowlist enforced, CSV escaping, import row
  validation, PATCH with unknown field rejected.
