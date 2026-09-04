import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { PencilIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { toastError } from '@/client/platform/api/errors';
import { userOptionLabel } from '@/client/platform/api/user-options';
import { usePermission } from '@/client/platform/auth/session';
import { DetailPage, FieldList, HistoryTab } from '@/client/platform/detail';
import { ConfirmDialog } from '@/client/platform/shell/confirm-dialog';
import { RelativeTime } from '@/client/platform/shell/relative-time';
import { LoadingPage, NotFoundPage } from '@/client/platform/shell/states';
import { Badge } from '@/client/platform/ui/badge';
import { Button } from '@/client/platform/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/client/platform/ui/tabs';
import { CustomerStatusBadge } from '@/client/features/customers/list';
import {
  useCustomer,
  useDeleteCustomer,
  useRestoreCustomer,
} from '@/client/features/customers/api';

/**
 * The golden example detail page: a field list, a history tab fed by
 * `GET /api/customers/:id/history`, and the actions the user's role allows.
 */
export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const customer = useCustomer(id);
  const remove = useDeleteCustomer();
  const restore = useRestoreCustomer();
  const mayWrite = usePermission('customers:write');
  const mayDelete = usePermission('customers:delete');

  if (customer.isPending) return <LoadingPage label="Loading customer" />;
  if (customer.isError) return <NotFoundPage />;

  const record = customer.data;
  const deleted = record.deletedAt !== null;

  const onDelete = async () => {
    try {
      await remove.mutateAsync(record.id);
      toast.success(`Deleted ${record.name}.`);
      setConfirmingDelete(false);
      void navigate('/customers');
    } catch (error) {
      toastError(error, 'Could not delete this customer.');
      setConfirmingDelete(false);
    }
  };

  const onRestore = async () => {
    try {
      await restore.mutateAsync(record.id);
      toast.success(`Restored ${record.name}.`);
    } catch (error) {
      toastError(error, 'Could not restore this customer.');
    }
  };

  return (
    <>
      <DetailPage
        title={record.name}
        backTo="/customers"
        backLabel="All customers"
        badge={
          <>
            <CustomerStatusBadge status={record.status} />
            {deleted ? <Badge variant="destructive">Deleted</Badge> : null}
          </>
        }
        actions={
          <>
            {mayWrite && !deleted ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`/customers/${record.id}/edit`}>
                  <PencilIcon />
                  Edit
                </Link>
              </Button>
            ) : null}
            {mayDelete && deleted ? (
              <Button
                size="sm"
                variant="outline"
                disabled={restore.isPending}
                onClick={() => void onRestore()}
              >
                <RotateCcwIcon />
                Restore
              </Button>
            ) : null}
            {mayDelete && !deleted ? (
              <Button size="sm" variant="destructive" onClick={() => setConfirmingDelete(true)}>
                <Trash2Icon />
                Delete
              </Button>
            ) : null}
          </>
        }
      >
        <Tabs
          // The open tab lives in the URL so a link can point straight at the history.
          value={searchParams.get('tab') === 'history' ? 'history' : 'details'}
          onValueChange={(value) =>
            setSearchParams(
              (previous) => {
                const next = new URLSearchParams(previous);
                if (value === 'details') next.delete('tab');
                else next.set('tab', value);
                return next;
              },
              { replace: true },
            )
          }
        >
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="pt-6">
            <FieldList
              items={[
                { label: 'Name', value: record.name },
                { label: 'Email', value: record.email },
                { label: 'Status', value: <CustomerStatusBadge status={record.status} /> },
                { label: 'Plan', value: <span className="capitalize">{record.plan}</span> },
                {
                  label: 'Tags',
                  value:
                    record.tags.length === 0 ? null : (
                      <div className="flex flex-wrap gap-1">
                        {record.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="font-normal">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ),
                },
                { label: 'Owner', value: record.owner ? userOptionLabel(record.owner) : null },
                {
                  label: 'Notes',
                  value: record.notes ? (
                    <p className="whitespace-pre-wrap">{record.notes}</p>
                  ) : null,
                },
                { label: 'Created', value: <RelativeTime value={record.createdAt} /> },
                {
                  label: 'Updated',
                  value: <RelativeTime value={record.updatedAt} fallback="Never" />,
                },
                ...(deleted
                  ? [{ label: 'Deleted', value: <RelativeTime value={record.deletedAt} /> }]
                  : []),
              ]}
            />
          </TabsContent>

          <TabsContent value="history" className="pt-6">
            <HistoryTab entityPath={`/api/customers/${record.id}/history`} />
          </TabsContent>
        </Tabs>
      </DetailPage>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${record.name}?`}
        description="The record is soft deleted: it disappears from the list but an admin can restore it."
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        onConfirm={() => void onDelete()}
      />
    </>
  );
}
