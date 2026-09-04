import { readFileSync } from 'node:fs';
import { Writable } from 'node:stream';
import pino from 'pino';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { envSchema } from '../../src/server/env';
import { setErrorReporter } from '../../src/server/platform/http/error-reporter';
import { loggerOptions } from '../../src/server/platform/http/logger';
import { json, signInAs } from './helpers';

describe('security headers', () => {
  it('are on every response, API and static alike', async () => {
    const app = createApp();
    for (const path of ['/healthz', '/api/nope']) {
      const res = await app.request(path);
      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    }
  });
});

describe('logging redaction', () => {
  it('never writes cookies, tokens or passwords to the log', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const log = pino({ ...loggerOptions, level: 'info', transport: undefined }, sink);
    log.info(
      {
        req: { headers: { cookie: 'sid=secret', authorization: 'Bearer x' } },
        user: { password: 'p', token: 't' },
      },
      'x',
    );
    log.flush();
    const out = lines.join('');
    expect(out).not.toContain('sid=secret');
    expect(out).not.toContain('Bearer x');
    expect(out).not.toMatch(/"password":"p"/);
    expect(out).not.toMatch(/"token":"t"/);
    expect(out).toContain('[redacted]');
  });
});

describe('failure paths', () => {
  it('readyz reports 503 when the database probe fails', async () => {
    const app = createApp({ pingDatabase: async () => false });
    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, database: 'down' });
  });

  it('unexpected errors become a generic 500 with a request id, and are reported once', async () => {
    const reported: unknown[] = [];
    setErrorReporter({ report: (err, ctx) => void reported.push({ err, ctx }) });
    try {
      const app = createApp({
        testRoutes: (a) =>
          a.get('/boom', () => {
            throw new Error('database password is hunter2');
          }),
      });
      const res = await app.request('/boom', { headers: { 'x-request-id': 'req-boom-0001' } });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toEqual({
        code: 'internal',
        message: 'Internal server error',
        requestId: 'req-boom-0001',
      });
      expect(JSON.stringify(body)).not.toContain('hunter2');
      expect(reported).toHaveLength(1);
      expect((reported[0] as { ctx: { requestId: string } }).ctx.requestId).toBe('req-boom-0001');
    } finally {
      setErrorReporter(null);
    }
  });
});

describe('client error reporting', () => {
  it('accepts anonymous reports, validates them, and rate limits', async () => {
    const app = createApp();
    const ok = await app.request(
      '/api/client-errors',
      json({ message: 'TypeError: x is undefined', url: '/customers', stack: 'at a.js:1' }),
    );
    expect(ok.status).toBe(204);
    const bad = await app.request('/api/client-errors', json({ message: '' }));
    expect(bad.status).toBe(400);
    const user = await signInAs('u@example.com', 'member');
    expect(
      (
        await app.request(
          '/api/client-errors',
          json({ message: 'signed in' }, { cookie: user.cookie }),
        )
      ).status,
    ).toBe(204);
    let last = 204;
    for (let i = 0; i < 40; i++)
      last = (await app.request('/api/client-errors', json({ message: 'flood' }))).status;
    expect(last).toBe(429);
  });
});

describe('configuration documentation', () => {
  // envSchema is a z.object wrapped in refinements; unwrap to reach the shape.
  let inner: z.ZodTypeAny = envSchema;
  while (inner instanceof z.ZodEffects) inner = inner.innerType();
  const envKeys = Object.keys((inner as z.ZodObject<z.ZodRawShape>).shape);
  it('env.ts, docs/CONFIG.md and .env.example agree on every variable', () => {
    expect(envKeys.length).toBeGreaterThan(20);
    const config = readFileSync('docs/CONFIG.md', 'utf8');
    const documented = new Set([...config.matchAll(/^\| `([A-Z][A-Z0-9_]+)`/gm)].map((m) => m[1]!));
    const example = readFileSync('.env.example', 'utf8');
    const exampled = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]!));

    const undocumented = envKeys.filter((k) => !documented.has(k));
    const documentedButUnread = [...documented].filter((k) => !envKeys.includes(k));
    const missingFromExample = envKeys.filter(
      (k) => !exampled.has(k) && !['NODE_ENV', 'APP_VERSION', 'DATABASE_URL_TEST'].includes(k),
    );
    expect(undocumented, 'read by env.ts but not in docs/CONFIG.md').toEqual([]);
    expect(documentedButUnread, 'in docs/CONFIG.md but env.ts does not read them').toEqual([]);
    expect(missingFromExample, 'read by env.ts but not in .env.example').toEqual([]);
  });
});
