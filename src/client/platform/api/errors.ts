import { toast } from 'sonner';
import { ApiRequestError } from '@/client/platform/api/client';

// One place that turns the error envelope into something worth showing a person, and
// keeps the request id visible so a report can be traced in the server logs.

const messages: Record<string, string> = {
  not_found: 'That record no longer exists.',
  forbidden: 'You do not have permission to do that.',
  conflict: 'Someone else changed this first. Reload and try again.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  validation_error: 'Some fields need attention.',
};

export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (!(error instanceof ApiRequestError)) return fallback;
  return messages[error.code] ?? error.message ?? fallback;
}

export function errorRequestId(error: unknown): string | undefined {
  return error instanceof ApiRequestError ? error.requestId : undefined;
}

/** Toast for an error nothing else handled. The request id goes in the description. */
export function toastError(error: unknown, fallback?: string) {
  const requestId = errorRequestId(error);
  toast.error(errorMessage(error, fallback), {
    description: requestId ? `Request ${requestId}` : undefined,
  });
}
