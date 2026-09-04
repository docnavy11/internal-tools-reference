import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ApiRequestError } from '@/client/platform/api/client';
import { reportClientError } from '@/client/platform/api/report-client-error';
import { Button } from '@/client/platform/ui/button';
import { NotFoundPage } from '@/client/platform/shell/states';

function describe(error: unknown): { title: string; message: string; requestId?: string } {
  if (error instanceof ApiRequestError) {
    return { title: 'Something went wrong', message: error.message, requestId: error.requestId };
  }
  if (error instanceof Error) {
    return { title: 'Something went wrong', message: error.message };
  }
  return { title: 'Something went wrong', message: 'An unexpected error occurred.' };
}

function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { title, message, requestId } = describe(error);
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-semibold">{title}</h2>
          <p className="text-muted-foreground text-sm">{message}</p>
        </div>
        {requestId ? (
          <p className="text-muted-foreground text-xs">
            Request id <code className="bg-muted rounded px-1 py-0.5 font-mono">{requestId}</code>
          </p>
        ) : null}
        <div className="flex justify-center gap-2">
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
          <Button size="sm" onClick={() => window.location.reload()}>
            Reload the page
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Route-level boundary: used as `errorElement` so a thrown error keeps the shell usable. */
export function RouteErrorBoundary() {
  const error = useRouteError();
  // A 404 is a page that does not exist, not a failure; everything else is reported.
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (!notFound) reportClientError(error);
  }, [error, notFound]);

  if (notFound) return <NotFoundPage />;
  return <ErrorPanel error={error} />;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: unknown, reset: () => void) => ReactNode;
}

/**
 * Render-error boundary for a subtree (a panel, a widget) where a failure should not
 * take the whole page down. Shows the request id when the error came from the API.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack);
    reportClientError(error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error == null) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
    return <ErrorPanel error={this.state.error} onRetry={this.reset} />;
  }
}
