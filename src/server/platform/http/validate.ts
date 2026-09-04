import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodSchema } from 'zod';

// zValidator with our error envelope: 400, code validation_error, Zod flatten() in
// details ({ formErrors, fieldErrors }) so forms can map errors onto fields.
export function validate<T extends ZodSchema, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'validation_error',
            message: 'Invalid request',
            details: result.error.flatten(),
            requestId: c.res.headers.get('x-request-id') ?? undefined,
          },
        },
        400,
      );
    }
  });
}
