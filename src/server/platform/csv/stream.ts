import type { Context } from 'hono';
import { stream } from 'hono/streaming';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s =
    value instanceof Date
      ? value.toISOString()
      : Array.isArray(value)
        ? value.join(';')
        : String(value);
  // Neutralise spreadsheet formula injection, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvLine(cells: unknown[]): string {
  return cells.map(escapeCell).join(',') + '\r\n';
}

// Streams rows as they are produced so large exports never sit in memory.
export function csvResponse<T>(
  c: Context,
  filename: string,
  columns: CsvColumn<T>[],
  rows: AsyncIterable<T> | Iterable<T>,
): Response {
  c.header('content-type', 'text/csv; charset=utf-8');
  c.header('content-disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`);
  c.header('cache-control', 'no-store');
  return stream(c, async (out) => {
    await out.write('\uFEFF' + csvLine(columns.map((col) => col.header)));
    for await (const row of rows) {
      await out.write(csvLine(columns.map((col) => col.value(row))));
    }
  });
}

export function csvFilename(base: string): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
}
