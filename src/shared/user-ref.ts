import { z } from 'zod';

// Minimal shape of a user shown next to a record (owner, actor, invited by). Any
// signed-in user may see this much about colleagues. Lives here, not in a feature, so
// features can be deleted without breaking each other.
export const userRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string().email(),
});
export type UserRef = z.infer<typeof userRefSchema>;
