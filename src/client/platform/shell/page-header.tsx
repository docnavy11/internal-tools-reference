// Every page starts with this: title, optional description, optional actions on the right.
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 pb-6">
      <div className="space-y-1">
        <h1 className="font-heading text-xl leading-tight font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {actions ? (
        // data-slot names the region so a test can aim at the header's own
        // action, not an identically labelled one inside the page (an empty
        // table offers its own "New …" link, and both are the same link).
        <div data-slot="page-header-actions" className="flex items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
