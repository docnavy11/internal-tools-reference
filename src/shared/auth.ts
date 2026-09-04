import { z } from 'zod';
import { roles, userStatuses, type Permission } from './permissions';

// Contract between the client and /api/auth/* and /api/me. See docs/blocks/01-auth.md.

export const oidcProviderIds = ['google', 'microsoft'] as const;
export type OidcProviderId = (typeof oidcProviderIds)[number];

// GET /api/auth/providers (public): which sign-in methods the login page should offer.
export interface AuthProvidersResponse {
  oidc: { id: OidcProviderId; label: string }[];
  magicLink: boolean;
  devLogin: boolean;
}

// GET /api/me: the signed-in user and their effective permissions, or 401.
export const currentUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: z.enum(roles),
  status: z.enum(userStatuses),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export interface MeResponse {
  user: CurrentUser;
  permissions: Permission[];
}

// POST /api/auth/magic/request
export const magicLinkRequestInput = z.object({ email: z.string().email().max(320) });

// POST /api/auth/dev (only when AUTH_DEV_LOGIN=true outside production)
export const devLoginInput = z.object({ email: z.string().email().max(320) });

// Error codes the auth callbacks put in /login?error=<code>.
export const loginErrorCodes = [
  'not_allowed', // email not in allowed domains and not invited
  'disabled', // account disabled by an admin
  'invalid_state', // OIDC state missing, expired or mismatched
  'provider_error', // provider returned an error or an unverifiable token
  'expired_link', // magic link expired or already used
  'unknown_provider', // provider id not configured
] as const;
export type LoginErrorCode = (typeof loginErrorCodes)[number];

export const loginErrorMessages: Record<LoginErrorCode, string> = {
  not_allowed: 'This account is not allowed to sign in. Ask an admin to invite you.',
  disabled: 'This account has been disabled.',
  invalid_state: 'The sign-in attempt expired. Please try again.',
  provider_error: 'Sign-in with the provider failed. Please try again.',
  expired_link: 'This sign-in link has expired or was already used. Request a new one.',
  unknown_provider: 'That sign-in method is not configured.',
};
