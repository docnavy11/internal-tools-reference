import { z } from 'zod';

// The only place process.env is read. Every variable is documented in docs/CONFIG.md
// and listed in .env.example. New variables go in all three places.

// `KEY=` in a .env file arrives as "" and means "not set" for optional variables.
const optionalString = (schema: z.ZodString = z.string().min(1)) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().min(1).default('internal-tools'),
    APP_URL: z.string().url(),
    APP_MODE: z.enum(['web', 'worker', 'all']).default('all'),
    PORT: z.coerce.number().int().positive().default(3000),
    HEALTH_PORT: z.coerce.number().int().positive().default(3001),
    APP_VERSION: z.string().default('dev'),
    LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
      .default('info'),
    SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),

    DATABASE_URL: z.string().min(1),
    DATABASE_URL_TEST: optionalString(),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    MIGRATE_ON_START: bool,

    AUTH_DEV_LOGIN: bool,
    AUTH_ALLOWED_DOMAINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean),
      ),
    AUTH_DEFAULT_ROLE: z.enum(['admin', 'member', 'viewer']).default('member'),
    AUTH_GOOGLE_CLIENT_ID: optionalString(),
    AUTH_GOOGLE_CLIENT_SECRET: optionalString(),
    AUTH_MICROSOFT_CLIENT_ID: optionalString(),
    AUTH_MICROSOFT_CLIENT_SECRET: optionalString(),
    AUTH_MICROSOFT_TENANT: z.string().min(1).default('organizations'),
    AUTH_MAGIC_LINK: bool,
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

    JOBS_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
    JOBS_POLL_MS: z.coerce.number().int().min(50).default(1000),
    JOBS_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
    JOBS_SHUTDOWN_GRACE_MS: z.coerce.number().int().min(0).default(30000),
    AUDIT_RETENTION_DAYS: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.coerce.number().int().min(1).optional(),
    ),

    EMAIL_DRIVER: z.enum(['console', 'smtp']).default('console'),
    EMAIL_FROM: optionalString(),
    SMTP_URL: optionalString(),

    SLACK_DRIVER: z.enum(['console', 'bot']).default('console'),
    SLACK_BOT_TOKEN: optionalString(),
    SLACK_DEFAULT_CHANNEL: optionalString(),

    STORAGE_DRIVER: z.enum(['disk', 's3']).default('disk'),
    FILES_DIR: z.string().default('./data/files'),
    UPLOAD_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(25 * 1024 * 1024),
    FILES_TRASH_DAYS: z.coerce.number().int().min(1).default(30),
    S3_BUCKET: optionalString(),
    S3_REGION: optionalString(),
    S3_ENDPOINT: optionalString(),
    S3_ACCESS_KEY_ID: optionalString(),
    S3_SECRET_ACCESS_KEY: optionalString(),
    S3_FORCE_PATH_STYLE: bool,

    // Example integration; enabled when the key is set. Real integrations follow the same shape.
    EXAMPLE_VENDOR_API_KEY: optionalString(),
    EXAMPLE_VENDOR_BASE_URL: z.string().url().default('https://example.invalid'),
    EXAMPLE_VENDOR_WEBHOOK_SECRET: optionalString(),
  })
  .refine((e) => !e.AUTH_GOOGLE_CLIENT_ID || e.AUTH_GOOGLE_CLIENT_SECRET, {
    message: 'required when AUTH_GOOGLE_CLIENT_ID is set',
    path: ['AUTH_GOOGLE_CLIENT_SECRET'],
  })
  .refine((e) => !e.AUTH_MICROSOFT_CLIENT_ID || e.AUTH_MICROSOFT_CLIENT_SECRET, {
    message: 'required when AUTH_MICROSOFT_CLIENT_ID is set',
    path: ['AUTH_MICROSOFT_CLIENT_SECRET'],
  })
  .refine((e) => e.EMAIL_DRIVER !== 'smtp' || (e.SMTP_URL && e.EMAIL_FROM), {
    message: 'SMTP_URL and EMAIL_FROM are required when EMAIL_DRIVER=smtp',
    path: ['EMAIL_DRIVER'],
  })
  .refine((e) => e.SLACK_DRIVER !== 'bot' || (e.SLACK_BOT_TOKEN && e.SLACK_DEFAULT_CHANNEL), {
    message: 'SLACK_BOT_TOKEN and SLACK_DEFAULT_CHANNEL are required when SLACK_DRIVER=bot',
    path: ['SLACK_DRIVER'],
  })
  .refine((e) => !e.EXAMPLE_VENDOR_API_KEY || e.EXAMPLE_VENDOR_WEBHOOK_SECRET, {
    message: 'required when EXAMPLE_VENDOR_API_KEY is set',
    path: ['EXAMPLE_VENDOR_WEBHOOK_SECRET'],
  })
  .refine(
    (e) =>
      e.STORAGE_DRIVER !== 's3' ||
      (e.S3_BUCKET && e.S3_REGION && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY),
    {
      message:
        'S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when STORAGE_DRIVER=s3',
      path: ['STORAGE_DRIVER'],
    },
  );

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
