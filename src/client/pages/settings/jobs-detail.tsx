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
import type { Job, JobStatus } from '@/shared/jobs';
import { useCancelJob, useJob, useRetryJob } from '@/client/pages/settings/jobs-api';
import { JobStatusBadge } from '@/client/pages/settings/jobs-status';

/**
 * The whole job in a side panel: everything the row truncates, plus the two actions
 * the server allows. The row is only the seed; the sheet refetches so the panel shows
 * the current state even after the list stopped polling.
 */

const retryable: JobStatus[] = ['failed', 'dead', 'cancelled'];

export function JobSheet({
  job: seed,
  onOpenChange,
}: {
  job: Job | null;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useJob(seed?.id ?? null);
  const job = query.data ?? seed;

  return (
    <Sheet open={seed !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {job ? <JobSheetBody job={job} loading={query.isPending && !seed} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function JobSheetBody({ job, loading }: { job: Job; loading: boolean }) {
  const [confirming, setConfirming] = useState<'retry' | 'cancel' | null>(null);
  const retry = useRetryJob();
  const cancel = useCancelJob();

  const mayRetry = retryable.includes(job.status);
  const mayCancel = job.status === 'pending';

  const run = async (action: 'retry' | 'cancel') => {
    try {
      if (action === 'retry') {
        await retry.mutateAsync(job.id);
        toast.success(`Queued ${job.name} to run again.`);
      } else {
        await cancel.mutateAsync(job.id);
        toast.success(`Cancelled ${job.name}.`);
      }
      setConfirming(null);
    } catch (caught) {
      toastError(caught, 'The job could not be changed. Reload and try again.');
      setConfirming(null);
    }
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-mono">{job.name}</SheetTitle>
        <SheetDescription>
          Job <span className="font-mono">{job.id}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-4">
        {loading ? <Skeleton className="h-4 w-40" /> : null}

        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm">
          <Field label="Status">
            <JobStatusBadge status={job.status} />
          </Field>
          <Field label="Attempts">
            <span className="font-mono">
              {job.attempts}/{job.maxAttempts}
            </span>
          </Field>
          <Field label="Run at">
            <RelativeTime value={job.runAt} />
          </Field>
          <Field label="Created">
            <RelativeTime value={job.createdAt} />
          </Field>
          <Field label="Started">
            <RelativeTime value={job.startedAt} />
          </Field>
          <Field label="Finished">
            <RelativeTime value={job.finishedAt} />
          </Field>
          <Field label="Locked by">
            {job.lockedBy ? (
              <span className="font-mono text-xs">{job.lockedBy}</span>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <Field label="Dedupe key">
            {job.dedupeKey ? (
              <span className="font-mono text-xs break-all">{job.dedupeKey}</span>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
        </dl>

        <JsonBlock label="Payload" value={job.payload} />
        {job.result === null || job.result === undefined ? null : (
          <JsonBlock label="Result" value={job.result} />
        )}

        {job.lastError ? (
          <section className="space-y-1">
            <h3 className="text-muted-foreground text-xs font-medium">Last error</h3>
            <pre
              data-testid="job-last-error"
              className="border-destructive/30 bg-destructive/5 text-destructive max-w-full overflow-x-auto rounded-md border p-2 text-xs whitespace-pre-wrap"
            >
              {job.lastError}
            </pre>
          </section>
        ) : null}
      </div>

      <SheetFooter className="flex-row justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!mayCancel || cancel.isPending}
          onClick={() => setConfirming('cancel')}
        >
          Cancel job
        </Button>
        <Button
          size="sm"
          disabled={!mayRetry || retry.isPending}
          onClick={() => setConfirming('retry')}
        >
          Retry
        </Button>
      </SheetFooter>

      <ConfirmDialog
        open={confirming === 'retry'}
        onOpenChange={(open) => setConfirming(open ? 'retry' : null)}
        title={`Run ${job.name} again?`}
        description="The job goes back to pending with its attempt counter reset, and the next free worker picks it up."
        confirmLabel="Retry"
        busy={retry.isPending}
        onConfirm={() => void run('retry')}
      />
      <ConfirmDialog
        open={confirming === 'cancel'}
        onOpenChange={(open) => setConfirming(open ? 'cancel' : null)}
        title={`Cancel ${job.name}?`}
        description="It will never run. A cancelled job can be retried later if you change your mind."
        confirmLabel="Cancel job"
        destructive
        busy={cancel.isPending}
        onConfirm={() => void run('cancel')}
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

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <section className="space-y-1">
      <h3 className="text-muted-foreground text-xs font-medium">{label}</h3>
      <pre
        data-testid={`job-${label.toLowerCase()}`}
        className="bg-muted/60 max-w-full overflow-x-auto rounded-md p-2 text-xs"
      >
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </section>
  );
}
