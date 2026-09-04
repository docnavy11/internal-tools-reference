import { useState } from 'react';
import { toast } from 'sonner';
import { toastError } from '@/client/platform/api/errors';
import { ConfirmDialog } from '@/client/platform/shell/confirm-dialog';
import { RelativeTime } from '@/client/platform/shell/relative-time';
import { Button } from '@/client/platform/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/client/platform/ui/sheet';
import { Skeleton } from '@/client/platform/ui/skeleton';
import type { WebhookEvent, WebhookEventDetail } from '@/shared/webhooks';
import { useReplayWebhook, useWebhookEvent } from '@/client/pages/settings/webhooks-api';
import { WebhookStatusBadge } from '@/client/pages/settings/webhooks-status';

/**
 * The whole delivery in a side panel: the payload and headers exactly as the vendor
 * sent them, which is what anybody debugging an integration actually needs, plus the
 * one action the server allows. The row is only the seed; the sheet refetches and
 * follows a replay to its result.
 */
export function WebhookSheet({
  event: seed,
  onOpenChange,
}: {
  event: WebhookEvent | null;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useWebhookEvent(seed?.id ?? null);
  const event = query.data ?? seed;

  return (
    <Sheet open={seed !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {event ? <WebhookSheetBody event={event} loading={query.isPending} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function isDetail(event: WebhookEvent | WebhookEventDetail): event is WebhookEventDetail {
  return 'payload' in event;
}

function WebhookSheetBody({
  event,
  loading,
}: {
  event: WebhookEvent | WebhookEventDetail;
  loading: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const replay = useReplayWebhook();

  const run = async () => {
    try {
      await replay.mutateAsync(event.id);
      toast.success('Queued the event to be processed again.', {
        description: 'It goes back to pending until the worker has run it.',
      });
      setConfirming(false);
    } catch (caught) {
      toastError(caught, 'The event could not be replayed.');
      setConfirming(false);
    }
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-mono">{event.eventType ?? 'Untyped event'}</SheetTitle>
        <SheetDescription>
          {event.vendor} delivery <span className="font-mono">{event.externalId}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-4">
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm">
          <Field label="Status">
            <WebhookStatusBadge status={event.status} />
          </Field>
          <Field label="Vendor">{event.vendor}</Field>
          <Field label="Event type">
            <span className="font-mono text-xs">{event.eventType ?? '—'}</span>
          </Field>
          <Field label="External id">
            <span className="font-mono text-xs break-all">{event.externalId}</span>
          </Field>
          <Field label="Attempts">
            <span data-testid="webhook-attempts" className="font-mono">
              {event.attempts}
            </span>
          </Field>
          <Field label="Received">
            <RelativeTime value={event.receivedAt} />
          </Field>
          <Field label="Processed">
            <RelativeTime value={event.processedAt} />
          </Field>
        </dl>

        {event.error ? (
          <section className="space-y-1">
            <h3 className="text-muted-foreground text-xs font-medium">Error</h3>
            <pre
              data-testid="webhook-error"
              className="border-destructive/30 bg-destructive/5 text-destructive max-w-full overflow-x-auto rounded-md border p-2 text-xs whitespace-pre-wrap"
            >
              {event.error}
            </pre>
          </section>
        ) : null}

        {isDetail(event) ? (
          <>
            <JsonBlock testId="webhook-payload" label="Payload" value={event.payload} />
            <JsonBlock testId="webhook-headers" label="Headers" value={event.headers} />
          </>
        ) : loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}
      </div>

      <SheetFooter className="flex-row justify-end gap-2">
        <Button size="sm" disabled={replay.isPending} onClick={() => setConfirming(true)}>
          Replay
        </Button>
      </SheetFooter>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Process this event again?"
        description="The stored payload is handed to the vendor's handler once more. Do it when the first attempt failed, or after a fix; a handler that is not idempotent will do its work twice."
        confirmLabel="Replay"
        busy={replay.isPending}
        onConfirm={() => void run()}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function JsonBlock({ testId, label, value }: { testId: string; label: string; value: unknown }) {
  return (
    <section className="space-y-1">
      <h3 className="text-muted-foreground text-xs font-medium">{label}</h3>
      <pre
        data-testid={testId}
        className="bg-muted/60 max-w-full overflow-x-auto rounded-md p-2 text-xs"
      >
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </section>
  );
}
