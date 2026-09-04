import { Link } from 'react-router';
import { FileQuestionIcon, Loader2Icon, LockIcon } from 'lucide-react';
import { Button } from '@/client/platform/ui/button';
import { EmptyState } from '@/client/platform/shell/empty-state';

// Full-height placeholder while a route or the session is still resolving.
export function LoadingPage({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="text-muted-foreground flex min-h-[60vh] w-full flex-col items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <Loader2Icon className="size-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={FileQuestionIcon}
        title="Page not found"
        description="The page you were looking for does not exist or has moved."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/">Back to home</Link>
          </Button>
        }
      />
    </div>
  );
}

export function NoAccessPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={LockIcon}
        title="No access"
        description="You do not have permission to view this page. Ask an admin if you need it."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/">Back to home</Link>
          </Button>
        }
      />
    </div>
  );
}
