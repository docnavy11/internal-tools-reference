import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';

const app = createApp();

describe('http platform', () => {
  it('healthz and readyz respond', async () => {
    const health = await app.request('/healthz');
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    const ready = await app.request('/readyz');
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({ ok: true, database: 'up' });
  });

  it('echoes a well-formed inbound request id and mints one otherwise', async () => {
    const echoed = await app.request('/healthz', { headers: { 'x-request-id': 'lb-abc-12345' } });
    expect(echoed.headers.get('x-request-id')).toBe('lb-abc-12345');

    const minted = await app.request('/healthz');
    expect(minted.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);

    // Anything that could smuggle characters into logs or headers is replaced.
    const hostile = await app.request('/healthz', {
      headers: { 'x-request-id': 'aaa" bbb ${jndi}' },
    });
    expect(hostile.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns the JSON error envelope for unknown API routes', async () => {
    const res = await app.request('/api/does-not-exist');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'));
  });
});
