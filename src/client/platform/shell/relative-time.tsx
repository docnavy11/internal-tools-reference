import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/platform/ui/tooltip';

// Timestamps are stored in UTC and formatted in the browser's zone. Native Intl only,
// no date library: relative in the cell, absolute in the tooltip.

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60_000],
  ['month', 30 * 24 * 60 * 60_000],
  ['week', 7 * 24 * 60 * 60_000],
  ['day', 24 * 60 * 60_000],
  ['hour', 60 * 60_000],
  ['minute', 60_000],
];

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatRelative(date: Date, now = new Date()): string {
  const diff = date.getTime() - now.getTime();
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) return relative.format(Math.round(diff / ms), unit);
  }
  return relative.format(Math.round(diff / 1000), 'second');
}

export function RelativeTime({
  value,
  fallback = '—',
}: {
  value: string | null | undefined;
  fallback?: string;
}) {
  if (!value) return <span className="text-muted-foreground">{fallback}</span>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return <span className="text-muted-foreground">{fallback}</span>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={date.toISOString()} className="cursor-default">
          {formatRelative(date)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{absolute.format(date)}</TooltipContent>
    </Tooltip>
  );
}
