import { z } from 'zod';

// Shapes every API response uses. Server and client both import from here.

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

// Query parameters every list endpoint accepts, before entity-specific filters.
export const listParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().max(64).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type ListParams = z.infer<typeof listParamsSchema>;
