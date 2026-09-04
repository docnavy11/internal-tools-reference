import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/server/env';

const valid = {
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://a:b@localhost/app',
};

describe('env', () => {
  it('reports every missing or invalid variable by name', () => {
    const result = parseEnv({ LOG_LEVEL: 'loud' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.some((p) => p.startsWith('APP_URL:'))).toBe(true);
    expect(result.problems.some((p) => p.startsWith('DATABASE_URL:'))).toBe(true);
    expect(result.problems.some((p) => p.startsWith('LOG_LEVEL:'))).toBe(true);
  });

  it('applies defaults and parses booleans and numbers', () => {
    const result = parseEnv({ ...valid, PORT: '8080', MIGRATE_ON_START: 'true' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.APP_MODE).toBe('all');
    expect(result.env.PORT).toBe(8080);
    expect(result.env.MIGRATE_ON_START).toBe(true);
    expect(result.env.AUTH_DEV_LOGIN).toBe(false);
  });

  it('treats empty optional variables from a copied .env.example as unset', () => {
    const result = parseEnv({
      ...valid,
      AUTH_GOOGLE_CLIENT_ID: '',
      EMAIL_FROM: '',
      AUDIT_RETENTION_DAYS: '',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.AUTH_GOOGLE_CLIENT_ID).toBeUndefined();
    expect(result.env.AUDIT_RETENTION_DAYS).toBeUndefined();
  });

  it('points DATABASE_URL at the test database under NODE_ENV=test', () => {
    const result = parseEnv({
      ...valid,
      NODE_ENV: 'test',
      DATABASE_URL_TEST: 'postgres://a:b@localhost/app_test',
    });
    expect(result.ok && result.env.DATABASE_URL).toBe('postgres://a:b@localhost/app_test');
  });
});
