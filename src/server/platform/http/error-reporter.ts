import { env } from '../../env';
import { logger } from './logger';

// One place that unexpected errors go. The console driver logs; the Sentry driver loads
// @sentry/node only when SENTRY_DSN is set, so the SDK is not a dependency of the template
// and can be added or upgraded without touching anything else.

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  jobId?: string;
  jobName?: string;
  [key: string]: unknown;
}

export interface ErrorReporter {
  report(err: unknown, ctx?: ErrorContext): void;
}

const consoleReporter: ErrorReporter = {
  report(err, ctx) {
    logger.error({ err, ...ctx }, 'unexpected error');
  },
};

async function sentryReporter(dsn: string): Promise<ErrorReporter> {
  let Sentry: { init: (o: object) => void; captureException: (e: unknown, h?: object) => unknown };
  try {
    Sentry = (await import('@sentry/node' as string)) as typeof Sentry;
  } catch {
    throw new Error(
      'SENTRY_DSN is set but @sentry/node is not installed. Run: npm install @sentry/node',
    );
  }
  Sentry.init({ dsn, environment: env.NODE_ENV, release: env.APP_VERSION });
  return {
    report(err, ctx) {
      consoleReporter.report(err, ctx);
      Sentry.captureException(err, { extra: ctx });
    },
  };
}

let reporter: ErrorReporter = consoleReporter;

// Called once at boot (main.ts). Without SENTRY_DSN this is a no-op.
export async function initErrorReporter(): Promise<void> {
  if (env.SENTRY_DSN) reporter = await sentryReporter(env.SENTRY_DSN);
}

export function reportError(err: unknown, ctx?: ErrorContext): void {
  reporter.report(err, ctx);
}

// Tests swap the reporter to assert on what was reported.
export function setErrorReporter(next: ErrorReporter | null): void {
  reporter = next ?? consoleReporter;
}
