import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ListChecksIcon } from 'lucide-react';
import { DataTable, useListParams, type FilterDef } from '@/client/platform/data-table';
import { PageHeader } from '@/client/platform/shell/page-header';
import { RelativeTime } from '@/client/platform/shell/relative-time';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/client/platform/ui/tabs';
import { jobFilters, jobSortColumns, jobStatuses, type Job } from '@/shared/jobs';
import {
  fetchJobPage,
  isJobActive,
  jobsListKey,
  useJobNames,
} from '@/client/pages/settings/jobs-api';
import { JobSheet } from '@/client/pages/settings/jobs-detail';
import { JobStatusBadge } from '@/client/pages/settings/jobs-status';
import { SchedulesTab } from '@/client/pages/settings/jobs-schedules';

/**
 * The jobs admin: what the worker has run and what it will run. Both tabs read the
 * same `jobs` query key, so retrying a job or running a schedule refreshes everything
 * without a reload.
 */

const tabs = ['jobs', 'schedules'] as const;
type JobsTab = (typeof tabs)[number];

// Rows that are still moving are worth another look; a list of finished jobs is not.
const POLL_MS = 5_000;

// Built by the tab because the name cell needs the sheet opener. The row is clickable
// too, but the button is what keyboard and screen readers use.
function jobColumns(open: (job: Job) => void): ColumnDef<Job>[] {
  return [
    {
      id: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <button
          type="button"
          className="font-mono text-xs hover:underline"
          onClick={() => open(row.original)}
        >
          {row.original.name}
        </button>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <JobStatusBadge status={row.original.status} />,
    },
    {
      id: 'attempts',
      header: 'Attempts',
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.attempts}/{row.original.maxAttempts}
        </span>
      ),
    },
    {
      id: 'runAt',
      header: 'Run at',
      cell: ({ row }) => <RelativeTime value={row.original.runAt} />,
    },
    {
      id: 'finishedAt',
      header: 'Finished',
      cell: ({ row }) => <RelativeTime value={row.original.finishedAt} />,
    },
    {
      id: 'lastError',
      header: 'Last error',
      cell: ({ row }) =>
        row.original.lastError ? (
          // Truncated here on purpose: the whole message is in the sheet.
          <span className="text-destructive block max-w-64 truncate text-xs">
            {row.original.lastError}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];
}

export function JobsPage() {
  // The active tab lives in the URL like every other list parameter, so a reload, a
  // bookmark and the back button all keep the tab the user was on.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: JobsTab = tabs.includes(tabParam as JobsTab) ? (tabParam as JobsTab) : 'jobs';

  const setTab = (next: string) =>
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (next === 'jobs') params.delete('tab');
        else params.set('tab', next);
        return params;
      },
      { replace: true },
    );

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Background work the worker has run, and the schedules that queue it."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>
        <TabsContent value="jobs" className="pt-4">
          <JobsTab />
        </TabsContent>
        <TabsContent value="schedules" className="pt-4">
          <SchedulesTab onRan={() => setTab('jobs')} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function JobsTab() {
  const list = useListParams(jobFilters, { defaultSort: 'createdAt', defaultOrder: 'desc' });
  const names = useJobNames();
  const [openJob, setOpenJob] = useState<Job | null>(null);
  const columns = jobColumns(setOpenJob);

  const filters: FilterDef<keyof typeof jobFilters.shape & string>[] = [
    {
      type: 'multi-select',
      key: 'status',
      label: 'Status',
      options: jobStatuses.map((status) => ({ value: status, label: status })),
    },
    {
      type: 'select',
      key: 'name',
      label: 'Job',
      options: (names.data ?? []).map((name) => ({ value: name, label: name })),
    },
  ];

  return (
    <>
      <DataTable
        queryKey={jobsListKey}
        fetchPage={fetchJobPage}
        columns={columns}
        list={list}
        sortColumns={jobSortColumns}
        filters={filters}
        entityName="jobs"
        // A row is not a page of its own: the sheet keeps the list underneath, which is
        // what an operator watching a queue wants.
        onRowClick={setOpenJob}
        refetchInterval={(page) => (page?.items.some(isJobActive) ? POLL_MS : false)}
        empty={{
          icon: ListChecksIcon,
          title: 'No jobs match',
          description: 'Change the filters, or wait for the worker to pick something up.',
        }}
      />
      <JobSheet job={openJob} onOpenChange={(open) => (open ? null : setOpenJob(null))} />
    </>
  );
}
