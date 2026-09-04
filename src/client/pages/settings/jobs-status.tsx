import { Badge } from '@/client/platform/ui/badge';
import type { JobStatus } from '@/shared/jobs';

// One badge for a job status, used by the list, the sheet and the schedules tab so a
// status always looks the same wherever it appears.

const variants: Record<JobStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  running: 'secondary',
  succeeded: 'default',
  failed: 'destructive',
  dead: 'destructive',
  cancelled: 'outline',
};

// `running` gets the one colour that is neither "fine" nor "wrong": work in progress.
const extra: Partial<Record<JobStatus, string>> = {
  running: 'bg-blue-500/15 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300',
  cancelled: 'text-muted-foreground',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge variant={variants[status]} className={extra[status]}>
      {status}
    </Badge>
  );
}
