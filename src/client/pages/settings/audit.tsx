import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ScrollTextIcon } from 'lucide-react';
import { api } from '@/client/platform/api/client';
import { DataTable, useListParams, type FilterDef } from '@/client/platform/data-table';
import { AuditDiff, actorLabel, humanizeAction } from '@/client/platform/detail';
import { PageHeader } from '@/client/platform/shell/page-header';
import { RelativeTime } from '@/client/platform/shell/relative-time';
import { Badge } from '@/client/platform/ui/badge';
import type { Page } from '@/shared/api-types';
import { auditFilters, auditSortColumns, type AuditEntry } from '@/shared/audit';

/**
 * The whole audit log, one row per recorded mutation. The same diff component the
 * history tab uses renders the before and after snapshots when a row is expanded.
 */

type AuditFilterKey = keyof typeof auditFilters.shape & string;

const columns: ColumnDef<AuditEntry>[] = [
  {
    id: 'at',
    header: 'When',
    cell: ({ row }) => <RelativeTime value={row.original.at} />,
  },
  {
    id: 'actor',
    header: 'Actor',
    cell: ({ row }) => (
      <span className="truncate">
        {actorLabel(row.original)}
        {row.original.actorType !== 'user' ? (
          <span className="text-muted-foreground ml-1 text-xs">({row.original.actorType})</span>
        ) : null}
      </span>
    ),
  },
  {
    id: 'action',
    header: 'Action',
    cell: ({ row }) => (
      <Badge variant="secondary" className="font-mono text-xs font-normal">
        {row.original.action}
      </Badge>
    ),
  },
  {
    id: 'entityType',
    header: 'Entity',
    cell: ({ row }) => <span className="capitalize">{row.original.entityType}</span>,
  },
  {
    id: 'entityId',
    header: 'Record',
    cell: ({ row }) =>
      row.original.entityId ? (
        <span className="font-mono text-xs">{row.original.entityId.slice(0, 8)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

function AuditRowDetail({ entry }: { entry: AuditEntry }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        {actorLabel(entry)} · {humanizeAction(entry.action)} · {entry.entityType}
        {entry.entityId ? <span className="font-mono text-xs"> {entry.entityId}</span> : null}
      </p>
      <AuditDiff before={entry.before} after={entry.after} />
      {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Metadata</p>
          <pre className="bg-muted/60 max-w-full overflow-x-auto rounded-md p-2 text-xs">
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function AuditPage() {
  const list = useListParams(auditFilters, { defaultSort: 'at', defaultOrder: 'desc' });

  // Distinct actions and entity types actually present, so the dropdowns cannot offer a
  // filter that matches nothing.
  const meta = useQuery({
    queryKey: ['audit', 'meta'],
    queryFn: () => api<{ actions: string[]; entityTypes: string[] }>('/api/audit/meta'),
    staleTime: 5 * 60_000,
  });

  const filters: FilterDef<AuditFilterKey>[] = [
    { type: 'user', key: 'actorId', label: 'Actor' },
    {
      type: 'select',
      key: 'action',
      label: 'Action',
      options: (meta.data?.actions ?? []).map((action) => ({ value: action, label: action })),
    },
    {
      type: 'select',
      key: 'entityType',
      label: 'Entity',
      options: (meta.data?.entityTypes ?? []).map((type) => ({ value: type, label: type })),
    },
    { type: 'date-range', fromKey: 'from', toKey: 'to', label: 'Date' },
    { type: 'text', key: 'entityId', label: 'Record id', placeholder: 'Record id' },
  ];

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every write, who made it, and what changed. Rows are never edited or removed."
      />
      <DataTable
        queryKey={['audit', 'list']}
        fetchPage={(search) => api<Page<AuditEntry>>(`/api/audit?${search.toString()}`)}
        exportUrl={(params) => `/api/audit?${params.toString()}&format=csv`}
        columns={columns}
        list={list}
        sortColumns={auditSortColumns}
        filters={filters}
        expandable={(entry) => <AuditRowDetail entry={entry} />}
        entityName="entries"
        empty={{
          icon: ScrollTextIcon,
          title: 'No entries match',
          description: 'Change the filters or widen the date range.',
        }}
      />
    </>
  );
}
