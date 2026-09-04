import pino from 'pino';
import { env } from '../../env';

export type Logger = pino.Logger;

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
    env.NODE_ENV === 'development'
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
