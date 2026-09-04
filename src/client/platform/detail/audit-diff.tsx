import { cn } from '@/client/lib/utils';

/**
 * The diff shown on the audit page and in a record's history tab. Audit snapshots are
 * the API shape of the record (`before` and `after`), so comparing them in the browser
 * is enough: the server stores what happened, the client decides how to show it.
 */

export type ChangeKind = 'added' | 'removed' | 'changed';

export interface FieldChange {
  field: string;
  kind: ChangeKind;
  before: unknown;
  after: unknown;
}

// `id` is the record the entry already points at, and `updatedAt` moves on every write
// without saying anything the entry's own timestamp does not.
const noisyFields = new Set(['id', 'updatedAt']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined;
}

/** Field-by-field difference between two snapshots. Either side may be missing. */
export function diffRecords(before: unknown, after: unknown): FieldChange[] {
  const from = asRecord(before) ?? {};
  const to = asRecord(after) ?? {};
  const fields = [...new Set([...Object.keys(from), ...Object.keys(to)])].filter(
    (field) => !noisyFields.has(field),
  );

  const changes: FieldChange[] = [];
  for (const field of fields.sort()) {
    const left = from[field];
    const right = to[field];
    if (JSON.stringify(left ?? null) === JSON.stringify(right ?? null)) continue;
    const kind: ChangeKind = isEmpty(left) ? 'added' : isEmpty(right) ? 'removed' : 'changed';
    changes.push({ field, kind, before: left, after: right });
  }
  return changes;
}

/** Nested objects and arrays are shown as JSON; there is no useful table for them. */
export function DiffValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">—</span>;
  if (typeof value === 'object') {
    return (
      <pre className="bg-muted/60 max-w-full overflow-x-auto rounded-md p-2 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  if (typeof value === 'boolean') return <span>{value ? 'true' : 'false'}</span>;
  return <span className="break-words">{String(value)}</span>;
}

const kindLabels: Record<ChangeKind, string> = {
  added: 'added',
  removed: 'removed',
  changed: 'changed',
};

export function AuditDiff({
  before,
  after,
  emptyLabel = 'No field changes recorded.',
}: {
  before: unknown;
  after: unknown;
  emptyLabel?: string;
}) {
  const changes = diffRecords(before, after);
  if (changes.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2">
      {changes.map((change) => (
        <li key={change.field} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-3">
          <span className="text-sm font-medium">
            <span>{change.field}</span>
            <span
              className={cn(
                'ml-2 text-xs font-normal',
                change.kind === 'added' && 'text-primary',
                change.kind === 'removed' && 'text-destructive',
                change.kind === 'changed' && 'text-muted-foreground',
              )}
            >
              {kindLabels[change.kind]}
            </span>
          </span>
          <div className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-start sm:gap-2">
            {change.kind !== 'added' ? (
              <div className="min-w-0 flex-1 line-through opacity-70">
                <DiffValue value={change.before} />
              </div>
            ) : null}
            {change.kind === 'changed' ? (
              <span className="text-muted-foreground hidden sm:inline">→</span>
            ) : null}
            {change.kind !== 'removed' ? (
              <div className="min-w-0 flex-1">
                <DiffValue value={change.after} />
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
