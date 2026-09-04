import { createRequire } from 'node:module';
import pino from 'pino';
import { env } from '../../env';

export type Logger = pino.Logger;

// pino-pretty is a devDependency. The production image has no dev dependencies, so a
// container started with NODE_ENV=development must still boot, just with JSON logs.
function prettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: { service: env.APP_NAME, mode: env.APP_MODE, version: env.APP_VERSION },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.authorization',
      '*.cookie',
      '*.token',
      '*.password',
      '*.secret',
    ],
    censor: '[redacted]',
  },
  transport:
    env.NODE_ENV === 'development' && prettyAvailable()
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname,service,mode,version',
          },
        }
      : undefined,
});
