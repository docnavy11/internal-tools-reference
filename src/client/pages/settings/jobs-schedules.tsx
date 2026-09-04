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
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Schedule</TableHead>
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
      {/* The job name sits under the schedule name rather than in a column of its own:
          the two are nearly the same string, and the column it saves is what kept
          "Run now" off the right edge at 1280. The description is the only free text
          here, so it is what truncates when the window gets narrower still. */}
      <TableCell>
        <div className="space-y-0.5">
          <div className="font-medium">{schedule.name}</div>
          <div className="text-muted-foreground font-mono text-xs" data-testid="schedule-job">
            {schedule.jobName}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <div className="font-mono text-xs whitespace-nowrap">{schedule.cron}</div>
          <div
            className="text-muted-foreground max-w-56 truncate text-xs"
            title={schedule.description}
          >
            {schedule.description}
          </div>
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <RelativeTime value={schedule.lastRunAt} fallback="Never" />
      </TableCell>
      <TableCell className="whitespace-nowrap">
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
      <TableCell className="text-right whitespace-nowrap">
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
