import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { WebhookIcon } from 'lucide-react';
import { DataTable, useListParams, type FilterDef } from '@/client/platform/data-table';
import { PageHeader } from '@/client/platform/shell/page-header';
import { RelativeTime } from '@/client/platform/shell/relative-time';
import { webhookFilters, webhookSortColumns, webhookStatuses } from '@/shared/webhooks';
import type { WebhookEvent } from '@/shared/webhooks';
import {
  fetchWebhookPage,
  useWebhookVendors,
  webhookPoll,
  webhooksListKey,
} from '@/client/pages/settings/webhooks-api';
import { WebhookSheet } from '@/client/pages/settings/webhooks-detail';
import { WebhookStatusBadge } from '@/client/pages/settings/webhooks-status';

/**
 * The inbound webhook inbox: what vendors have sent us and what became of it. The
 * event type opens the sheet, where the payload and headers are; the row is clickable
 * too, but the button is what keyboard and screen readers use.
 */

function webhookColumns(open: (event: WebhookEvent) => void): ColumnDef<WebhookEvent>[] {
  return [
    {
      id: 'receivedAt',
      header: 'Received',
      cell: ({ row }) => <RelativeTime value={row.original.receivedAt} />,
    },
    { id: 'vendor', header: 'Vendor', cell: ({ row }) => row.original.vendor },
    {
      id: 'eventType',
      header: 'Event type',
      cell: ({ row }) => (
        <button
          type="button"
          className="font-mono text-xs hover:underline"
          onClick={() => open(row.original)}
        >
          {row.original.eventType ?? 'untyped'}
        </button>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <WebhookStatusBadge status={row.original.status} />,
    },
    {
      id: 'attempts',
      header: 'Attempts',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.attempts}</span>,
    },
    {
      id: 'processedAt',
      header: 'Processed',
      cell: ({ row }) => <RelativeTime value={row.original.processedAt} />,
    },
    {
      id: 'error',
      header: 'Error',
      cell: ({ row }) =>
        row.original.error ? (
          // Truncated here on purpose: the whole message is in the sheet.
          <span className="text-destructive block max-w-64 truncate text-xs">
            {row.original.error}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];
}

export function WebhooksPage() {
  const list = useListParams(webhookFilters, { defaultSort: 'receivedAt', defaultOrder: 'desc' });
  const vendors = useWebhookVendors();
  const [openEvent, setOpenEvent] = useState<WebhookEvent | null>(null);

  const filters: FilterDef<keyof typeof webhookFilters.shape & string>[] = [
    {
      type: 'select',
      key: 'vendor',
      label: 'Vendor',
      options: (vendors.data ?? []).map((vendor) => ({ value: vendor, label: vendor })),
    },
    {
      type: 'multi-select',
      key: 'status',
      label: 'Status',
      options: webhookStatuses.map((status) => ({ value: status, label: status })),
    },
    { type: 'text', key: 'eventType', label: 'Event type' },
  ];

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Events vendors have sent us, what the worker made of them, and a way to run one again."
      />
      <DataTable
        queryKey={webhooksListKey}
        fetchPage={fetchWebhookPage}
        columns={webhookColumns(setOpenEvent)}
        list={list}
        sortColumns={webhookSortColumns}
        filters={filters}
        entityName="events"
        onRowClick={setOpenEvent}
        refetchInterval={webhookPoll}
        empty={{
          icon: WebhookIcon,
          title: 'No webhook events match',
          description:
            'Change the filters, or wait for a vendor to deliver something. An integration only receives events when its secret is configured.',
        }}
      />
      <WebhookSheet event={openEvent} onOpenChange={(open) => (open ? null : setOpenEvent(null))} />
    </>
  );
}
