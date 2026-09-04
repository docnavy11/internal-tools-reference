import { z } from 'zod';

// The only place process.env is read. Every variable is documented in docs/CONFIG.md
// and listed in .env.example. New variables go in all three places.

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().min(1).default('internal-tools'),
  APP_URL: z.string().url(),
  APP_MODE: z.enum(['web', 'worker', 'all']).default('all'),
  PORT: z.coerce.number().int().positive().default(3000),
  HEALTH_PORT: z.coerce.number().int().positive().default(3001),
  APP_VERSION: z.string().default('dev'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),

  DATABASE_URL: z.string().min(1),
  DATABASE_URL_TEST: z.string().min(1).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  MIGRATE_ON_START: bool,

  AUTH_DEV_LOGIN: bool,
});

export type Env = z.infer<typeof envSchema>;

export type ParseResult = { ok: true; env: Env } | { ok: false; problems: string[] };

export function parseEnv(source: Record<string, string | undefined>): ParseResult {
  const input = { ...source };
  // Tests run against a separate database so a mistake can never touch dev data.
  if (input.NODE_ENV === 'test' && input.DATABASE_URL_TEST) {
    input.DATABASE_URL = input.DATABASE_URL_TEST;
  }
  const result = envSchema.safeParse(input);
  if (result.success) return { ok: true, env: result.data };
  const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  return { ok: false, problems };
}

function loadEnv(): Env {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env file. Containers and CI set the environment directly.
  }
  const parsed = parseEnv(process.env);
  if (!parsed.ok) {
    console.error('Invalid environment configuration:\n  ' + parsed.problems.join('\n  '));
    console.error('See docs/CONFIG.md and .env.example.');
    process.exit(1);
  }
  return parsed.env;
}

export const env: Env = loadEnv();
