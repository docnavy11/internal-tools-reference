import { bodyLimit } from 'hono/body-limit';
import type { MiddlewareHandler } from 'hono';
import { env } from '../../env';
import { AppError } from './errors';
import type { AppEnv } from './types';

// Reject oversized bodies before they are buffered. JSON endpoints get a small cap;
// multipart upload routes get UPLOAD_MAX_BYTES plus room for the other form fields.
const tooLarge = () => {
  throw new AppError('payload_too_large', 413, 'The request body is too large');
};

export const jsonBodyLimit: MiddlewareHandler<AppEnv> = bodyLimit({
  maxSize: 1024 * 1024,
  onError: tooLarge,
});

export const uploadBodyLimit: MiddlewareHandler<AppEnv> = bodyLimit({
  maxSize: env.UPLOAD_MAX_BYTES + 1024 * 1024,
  onError: tooLarge,
});
