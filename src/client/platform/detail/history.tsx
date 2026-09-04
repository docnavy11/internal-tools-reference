import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertCircleIcon, HistoryIcon } from 'lucide-react';
import { api } from '@/client/platform/api/client';
import { errorMessage, errorRequestId } from '@/client/platform/api/errors';
import { AuditDiff } from '@/client/platform/detail/audit-diff';
import { EmptyState } from '@/client/platform/shell/empty-state';
import { RelativeTime } from '@/client/platform/shell/relative-time';
import { Badge } from '@/client/platform/ui/badge';
import { Button } from '@/client/platform/ui/button';
import { Skeleton } from '@/client/platform/ui/skeleton';
import type { Page } from '@/shared/api-types';
import type { AuditEntry } from '@/shared/audit';

/**
 * `GET /api/<plural>/:id/history` for one record, newest first. The same entries the
 * audit page shows, filtered to this record by the server.
 */
export function useHistory(entityPath: string, pageSize = 20) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['history', entityPath, page, pageSize],
    queryFn: () => api<Page<AuditEntry>>(`${entityPath}?page=${page}&pageSize=${pageSize}`),
    placeholderData: keepPreviousData,
  });
  return { query, page, setPage, pageSize };
}

/** `customers.bulk_status` reads as "Bulk status". The raw action is shown next to it. */
export function humanizeAction(action: string): string {
  const verb = action.split('.').slice(1).join('.') || action;
  const words = verb.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function actorLabel(entry: AuditEntry): string {
  if (entry.actor) return entry.actor.name ?? entry.actor.email;
  return entry.actorType === 'user'
    ? 'A deleted user'
    : entry.actorType === 'job'
      ? 'A job'
      : 'The system';
}

export function HistoryTimeline({
  page,
  isPending,
  error,
  onRetry,
}: {
  page: Page<AuditEntry> | undefined;
  isPending: boolean;
  error?: unknown;
  onRetry?: () => void;
}) {
  if (isPending) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertCircleIcon}
        title={errorMessage(error, 'Could not load the history.')}
        description={errorRequestId(error) ? `Request ${errorRequestId(error)}` : undefined}
        action={
          onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          ) : undefined
        }
      />
    );
  }

  const entries = page?.items ?? [];
  if (entries.length === 0) {
    return <EmptyState icon={HistoryIcon} title="Nothing has happened to this record yet." />;
  }

  return (
    <ol className="border-border space-y-6 border-l pl-6">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            aria-hidden
            className="bg-border absolute top-1.5 -left-[1.6875rem] size-2 rounded-full ring-background ring-4"
          />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-medium">{actorLabel(entry)}</span>
            <span>{humanizeAction(entry.action).toLowerCase()}</span>
            <span className="text-muted-foreground">
              <RelativeTime value={entry.at} />
            </span>
            <Badge variant="secondary" className="font-mono text-xs font-normal">
              {entry.action}
            </Badge>
          </div>
          <div className="mt-2">
            <AuditDiff before={entry.before} after={entry.after} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Timeline plus paging, ready to drop into a tab on a detail page. */
export function HistoryTab({
  entityPath,
  pageSize = 20,
}: {
  entityPath: string;
  pageSize?: number;
}) {
  const { query, page, setPage } = useHistory(entityPath, pageSize);
  const total = query.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <HistoryTimeline
        page={query.data}
        isPending={query.isPending}
        error={query.isError ? query.error : undefined}
        onRetry={() => void query.refetch()}
      />
      {lastPage > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage(page - 1)}
          >
            Newer
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {page} of {lastPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage || query.isFetching}
            onClick={() => setPage(page + 1)}
          >
            Older
          </Button>
        </div>
      ) : null}
    </div>
  );
}
