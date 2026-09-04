import { Link } from 'react-router';
import { ArrowLeftIcon } from 'lucide-react';
import { PageHeader } from '@/client/platform/shell/page-header';
import { Button } from '@/client/platform/ui/button';

/**
 * The frame for one record: a way back, the title with a status badge next to it, the
 * actions on the right, and whatever the feature puts in the body (usually tabs).
 */
export function DetailPage({
  title,
  description,
  badge,
  actions,
  backTo,
  backLabel = 'Back',
  children,
}: {
  title: string;
  description?: string;
  /** Status badge slot, rendered next to the title. */
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  backTo?: string;
  backLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {backTo ? (
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link to={backTo}>
            <ArrowLeftIcon />
            {backLabel}
          </Link>
        </Button>
      ) : null}
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {badge}
            {actions}
          </>
        }
      />
      {children}
    </>
  );
}
