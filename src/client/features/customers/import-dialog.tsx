import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon, DownloadIcon, Loader2Icon, UploadIcon } from 'lucide-react';
import { ApiRequestError } from '@/client/platform/api/client';
import { errorMessage } from '@/client/platform/api/errors';
import { Button } from '@/client/platform/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/client/platform/ui/dialog';
import { Input } from '@/client/platform/ui/input';
import { Label } from '@/client/platform/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/platform/ui/table';
import {
  customerImportColumns,
  type ImportAccepted,
  type ImportStatus,
} from '@/shared/features/customers/schema';
import {
  customersImportTemplateUrl,
  customersKey,
  importCustomers,
  isImportDone,
  useImportStatus,
} from '@/client/features/customers/api';

/**
 * Bulk create from a CSV. The server validates every row while the user waits and
 * answers 202 with what it rejected, then creates the accepted rows in a background
 * job that this dialog polls. Two lists of problems, in other words: rows the file
 * got wrong (before anything was written) and rows the job could not create.
 */

/**
 * How far the dialog has got. Whether the job is still running is not kept here: it is
 * whatever the status query last said, so there is one source of truth for it.
 */
type Phase = 'pick' | 'uploading' | 'submitted';

export function ImportCustomersDialog() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [accepted, setAccepted] = useState<ImportAccepted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Nothing accepted means no job worth watching, so the poll never starts.
  const watching = phase === 'submitted' && (accepted?.accepted ?? 0) > 0;
  const status = useImportStatus(watching ? (accepted?.jobId ?? null) : null);
  const finished = status.data && isImportDone(status.data) ? status.data : null;
  const running = watching && finished === null;

  const reset = () => {
    setPhase('pick');
    setFile(null);
    setAccepted(null);
    setError(null);
  };

  const close = async () => {
    setOpen(false);
    // Whatever the job created is not in the list the page is showing.
    await queryClient.invalidateQueries({ queryKey: customersKey });
    reset();
  };

  const upload = async () => {
    if (!file) return;
    setError(null);
    setPhase('uploading');
    try {
      const result = await importCustomers(file);
      setAccepted(result);
      setPhase('submitted');
    } catch (caught) {
      setError(describeImportError(caught));
      setPhase('pick');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-run only hides the dialog; the job carries on.
        if (!next) void close();
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UploadIcon />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import customers from CSV</DialogTitle>
          <DialogDescription>
            Every row is checked before anything is written. Valid rows are created in the
            background.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2">
          {phase === 'pick' ? (
            <PickStep file={file} onFile={setFile} error={error} />
          ) : phase === 'uploading' ? (
            <Waiting label="Checking the file…" />
          ) : (
            <ResultSteps
              accepted={accepted}
              running={running}
              finished={finished}
              statusError={status.isError ? errorMessage(status.error) : null}
            />
          )}
        </div>

        <DialogFooter>
          {phase === 'pick' ? (
            <>
              <Button type="button" variant="outline" onClick={() => void close()}>
                Cancel
              </Button>
              <Button type="button" disabled={!file} onClick={() => void upload()}>
                Upload
              </Button>
            </>
          ) : (
            <Button type="button" disabled={phase === 'uploading'} onClick={() => void close()}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickStep({
  file,
  onFile,
  error,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 text-sm">
        <p>
          The first line is a header. These columns are read, in any order; only{' '}
          <span className="font-mono text-xs">name</span> is required.
        </p>
        <ul className="text-muted-foreground space-y-1 text-sm">
          <li>
            <Col>name</Col> the company or person. Required.
          </li>
          <li>
            <Col>email</Col> one address, or empty.
          </li>
          <li>
            <Col>status</Col> lead, active or churned. Empty means lead.
          </li>
          <li>
            <Col>plan</Col> free, pro or enterprise. Empty means free.
          </li>
          <li>
            <Col>tags</Col> separated by semicolons, for example{' '}
            <span className="font-mono text-xs">vip;eu</span>.
          </li>
          <li>
            <Col>owner</Col> the email address of an active user, or empty.
          </li>
          <li>
            <Col>notes</Col> free text.
          </li>
        </ul>
        <p className="text-muted-foreground text-xs">
          At most 5000 rows and 5 MB per file. Columns: {customerImportColumns.join(', ')}.
        </p>
      </div>

      <Button asChild variant="outline" size="sm">
        {/* A normal navigation, not fetch: the browser handles the attachment. */}
        <a href={customersImportTemplateUrl} download>
          <DownloadIcon />
          Download the template
        </a>
      </Button>

      <div className="space-y-2">
        <Label htmlFor="import-file">CSV file</Label>
        <Input
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
        {file ? (
          <p className="text-muted-foreground text-xs">
            {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ResultSteps({
  accepted,
  running,
  finished,
  statusError,
}: {
  accepted: ImportAccepted | null;
  running: boolean;
  finished: ImportStatus | null;
  statusError: string | null;
}) {
  if (!accepted) return null;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-sm font-medium" data-testid="import-accepted">
          {accepted.accepted} {accepted.accepted === 1 ? 'row' : 'rows'} accepted,{' '}
          {accepted.rejected.length} rejected.
        </p>
        <p className="text-muted-foreground text-xs">
          Job <span className="font-mono">{accepted.jobId}</span>
        </p>
      </div>

      {accepted.rejected.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Rejected rows</h3>
          <p className="text-muted-foreground text-xs">
            These were not written. Fix them in the file and import it again.
          </p>
          <div className="overflow-x-auto rounded-lg border" data-testid="import-rejected">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Line</TableHead>
                  <TableHead>Problem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accepted.rejected.map((row) => (
                  <TableRow key={row.line}>
                    <TableCell className="font-mono text-xs">{row.line}</TableCell>
                    <TableCell className="text-xs">{row.errors.join('. ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {accepted.accepted === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing was accepted, so no records were created.
        </p>
      ) : running ? (
        <Waiting label="Creating the accepted rows…" />
      ) : statusError ? (
        <p role="alert" className="text-destructive text-sm">
          {statusError}
        </p>
      ) : finished ? (
        <FinishedPanel status={finished} />
      ) : null}
    </div>
  );
}

function FinishedPanel({ status }: { status: ImportStatus }) {
  if (status.status === 'succeeded' && status.result) {
    return (
      <section className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium" data-testid="import-created">
          <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
          Created {status.result.created} {status.result.created === 1 ? 'customer' : 'customers'}.
        </p>
        {status.result.failed.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border" data-testid="import-failed">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Line</TableHead>
                  <TableHead>Problem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.result.failed.map((row) => (
                  <TableRow key={row.line}>
                    <TableCell className="font-mono text-xs">{row.line}</TableCell>
                    <TableCell className="text-xs">{row.error}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="space-y-1" data-testid="import-job-failed">
      <p role="alert" className="text-destructive text-sm font-medium">
        The import job {status.status === 'cancelled' ? 'was cancelled' : 'did not finish'}.
      </p>
      {status.lastError ? (
        <pre className="bg-muted/60 max-w-full overflow-x-auto rounded-md p-2 text-xs whitespace-pre-wrap">
          {status.lastError}
        </pre>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Job <span className="font-mono">{status.jobId}</span>. An admin can retry it on the jobs
        page.
      </p>
    </section>
  );
}

function Waiting({ label }: { label: string }) {
  return (
    <p
      className="text-muted-foreground flex items-center gap-2 text-sm"
      role="status"
      aria-live="polite"
    >
      <Loader2Icon className="size-4 animate-spin" />
      {label}
    </p>
  );
}

function Col({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground font-mono text-xs">{children}</span>;
}

/** Form-level messages the import endpoint puts in `details.formErrors`. */
function describeImportError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const details = error.details as { formErrors?: string[] } | undefined;
    const formErrors = details?.formErrors ?? [];
    if (formErrors.length > 0) return formErrors.join('. ');
  }
  return errorMessage(error, 'The file could not be imported.');
}
