import { z } from 'zod';
import { userRefSchema } from './user-ref';

// Settings admin API (permission settings:manage). Keys and their types are declared in
// code (the registry); the table only stores overrides. See docs/blocks/10-settings-and-flags.md.

export const settingTypes = ['boolean', 'string', 'number', 'enum'] as const;

export const settingSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  group: z.string(),
  type: z.enum(settingTypes),
  options: z.array(z.string()).nullable(), // for enum
  default: z.unknown(),
  value: z.unknown(), // effective value: override if present and valid, else default
  overridden: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
  updatedBy: userRefSchema.nullable(),
});
export type Setting = z.infer<typeof settingSchema>;

// PATCH /api/settings/:key body. `value: null` removes the override.
export const settingUpdateInput = z.object({ value: z.unknown() });
