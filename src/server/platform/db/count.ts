// Drizzle count() rows come back as { total: number | string }[]; normalise to a number.
export function totalOf(rows: { total: number | string }[]): number {
  return Number(rows[0]?.total ?? 0);
}
