import { z } from 'zod';

// List filters travel in the query string. Multi-value filters are one parameter with
// comma-separated values (`status=lead,active`) so client and server build them the
// same way and Hono's single-value `c.req.query()` is enough.
export function csvArray<T extends z.ZodTypeAny>(item: T) {
  return z
    .preprocess(
      (v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v),
      z.array(item).min(1),
    )
    .optional();
}

export function toCsvParam(values: readonly string[] | undefined): string | undefined {
  return values && values.length ? values.join(',') : undefined;
}
