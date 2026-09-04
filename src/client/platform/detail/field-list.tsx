export interface FieldListItem {
  label: string;
  /** `null` and `undefined` render as an em dash, so an empty field still lines up. */
  value: React.ReactNode;
}

/** Read-only label and value grid for a record. */
export function FieldList({ items }: { items: FieldListItem[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[10rem_1fr]">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-muted-foreground text-sm">{item.label}</dt>
          <dd className="min-w-0 text-sm">
            {item.value === null || item.value === undefined || item.value === '' ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
