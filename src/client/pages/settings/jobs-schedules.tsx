import { AlertCircleIcon, CalendarClockIcon, PlayIcon } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, toastError } from '@/client/platform/api/errors';
import { EmptyState } from '@/client/platform/shell/empty-state';
import { RelativeTime } from '@/client/platform/shell/relative-time';
import { Button } from '@/client/platform/ui/button';
import { Skeleton } from '@/client/platform/ui/skeleton';
import { Switch } from '@/client/platform/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/platform/ui/table';
import type { Schedule } from '@/shared/jobs';
import {
  useRunSchedule,
  useSchedules,
  useSetScheduleEnabled,
} from '@/client/pages/settings/jobs-api';

/**
 * Schedules are defined in code and upserted at worker start, so the list is short,
 * fixed and unpaged: a plain table rather than the DataTable kit. Only `enabled` and
 * "run now" are editable; the cron expression itself changes with a deploy.
 */
export function SchedulesTab({ onRan }: { onRan: () => void }) {
  const query = useSchedules();

  if (query.isPending) {
    return (
      <div className="space-y-2 rounded-xl border p-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-xl border">
        <EmptyState
          icon={AlertCircleIcon}
          title={errorMessage(query.error, 'Could not load the schedules.')}
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const schedules = query.data ?? [];
  if (schedules.length === 0) {
    return (
      <div className="rounded-xl border">
        <EmptyState
          icon={CalendarClockIcon}
          title="No schedules"
          description="Schedules are declared in code with defineSchedule and appear here once a worker has started."
        />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Job</TableHead>
            <TableHead>Last run</TableHead>
            <TableHead>Next run</TableHead>
            <TableHead>Enabled</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {schedules.map((schedule) => (
            <ScheduleRow key={schedule.name} schedule={schedule} onRan={onRan} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ScheduleRow({ schedule, onRan }: { schedule: Schedule; onRan: () => void }) {
  const setEnabled = useSetScheduleEnabled();
  const runNow = useRunSchedule();

  const toggle = async (enabled: boolean) => {
    try {
      await setEnabled.mutateAsync({ name: schedule.name, enabled });
      toast.success(`${schedule.name} is now ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (caught) {
      toastError(caught, 'The schedule could not be changed.');
    }
  };

  const run = async () => {
    try {
      await runNow.mutateAsync(schedule.name);
      toast.success(`Queued ${schedule.jobName}.`, {
        description: 'Follow it on the Jobs tab.',
      });
      onRan();
    } catch (caught) {
      toastError(caught, 'The job could not be queued.');
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{schedule.name}</TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <div className="font-mono text-xs">{schedule.cron}</div>
          <div className="text-muted-foreground text-xs">{schedule.description}</div>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs">{schedule.jobName}</TableCell>
      <TableCell>
        <RelativeTime value={schedule.lastRunAt} fallback="Never" />
      </TableCell>
      <TableCell>
        {schedule.enabled ? (
          <RelativeTime value={schedule.nextRunAt} />
        ) : (
          <span className="text-muted-foreground">Paused</span>
        )}
      </TableCell>
      <TableCell>
        <Switch
          checked={schedule.enabled}
          disabled={setEnabled.isPending}
          aria-label={`Enable ${schedule.name}`}
          onCheckedChange={(checked) => void toggle(checked)}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="outline"
          size="sm"
          disabled={runNow.isPending}
          aria-label={`Run ${schedule.name} now`}
          onClick={() => void run()}
        >
          <PlayIcon />
          Run now
        </Button>
      </TableCell>
    </TableRow>
  );
}
