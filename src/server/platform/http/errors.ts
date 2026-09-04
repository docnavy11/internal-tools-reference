import type { ContentfulStatusCode } from 'hono/utils/http-status';

// Expected failures throw AppError and become a JSON error envelope with their status.
// Anything else becomes a 500 with a generic message; the real error is logged.
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: ContentfulStatusCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Resource') => new AppError('not_found', 404, `${what} not found`);
export const badRequest = (message: string, details?: unknown) =>
  new AppError('bad_request', 400, message, details);
export const unauthorized = () => new AppError('unauthorized', 401, 'Authentication required');
export const forbidden = () =>
  new AppError('forbidden', 403, 'You do not have permission to do this');
