import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createVendorClient, VendorError } from '../../src/server/platform/http/vendor-client';

type Reply =
  { status: number; body?: unknown; headers?: Record<string, string>; delayMs?: number } | Error;

function fakeFetch(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const reply = replies.shift();
    if (!reply) throw new Error('no more replies');
    if (reply instanceof Error) throw reply;
    if (reply.delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, reply.delayMs);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new Error('aborted'));
        });
      });
    }
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json', ...reply.headers },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const widget = z.object({ id: z.string() });

describe('vendor client', () => {
  it('sends auth headers, builds urls with query, and validates the response', async () => {
    const f = fakeFetch([{ status: 200, body: [{ id: 'w1' }] }]);
    const client = createVendorClient({
      name: 'acme',
      baseUrl: 'https://api.acme.test/v1',
      headers: { authorization: 'Bearer k' },
      fetchImpl: f.impl,
    });
    const out = await client.get('widgets', {
      schema: z.array(widget),
      query: { limit: 5, active: true },
    });
    expect(out).toEqual([{ id: 'w1' }]);
    expect(f.calls[0]!.url).toBe('https://api.acme.test/v1/widgets?limit=5&active=true');
    expect((f.calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer k');

    const bad = fakeFetch([{ status: 200, body: { nope: true } }]);
    const client2 = createVendorClient({
      name: 'acme',
      baseUrl: 'https://api.acme.test/v1',
      fetchImpl: bad.impl,
    });
    await expect(client2.get('widgets/1', { schema: widget })).rejects.toThrow();
  });

  it('retries idempotent calls on 503 and 429 (honouring Retry-After), not on 400', async () => {
    const f = fakeFetch([
      { status: 503 },
      { status: 429, headers: { 'retry-after': '0' } },
      { status: 200, body: { id: 'ok' } },
    ]);
    const client = createVendorClient({
      name: 'acme',
      baseUrl: 'https://api.acme.test',
      fetchImpl: f.impl,
      retries: 3,
    });
    expect(await client.get('widgets/1', { schema: widget })).toEqual({ id: 'ok' });
    expect(f.calls).toHaveLength(3);

    const g = fakeFetch([{ status: 400, body: { error: 'bad' } }]);
    const client2 = createVendorClient({
      name: 'acme',
      baseUrl: 'https://api.acme.test',
      fetchImpl: g.impl,
    });
    await expect(client2.get('widgets/1', { schema: widget })).rejects.toMatchObject({
      name: 'VendorError',
      status: 400,
    });
    expect(g.calls).toHaveLength(1);
  }, 15_000);

  it('does not retry POST without an idempotency key, does with one', async () => {
    const f = fakeFetch([{ status: 503 }, { status: 200, body: { id: 'x' } }]);
    const client = createVendorClient({
      name: 'acme',
      baseUrl: 'https://api.acme.test',
      fetchImpl: f.impl,
    });
    await expect(
      client.post('widgets', { schema: widget, body: { name: 'n' } }),
    ).rejects.toBeInstanceOf(VendorError);
    expect(f.calls).toHaveLength(1);

    const g = fakeFetch([{ status: 503 }, { status: 200, body: { id: 'x' } }]);
    const client2 = createVendorClient({
      name: 'acme',
      baseUrl: 'https://api.acme.test',
      fetchImpl: g.impl,
    });
    expect(
      await client2.post('widgets', { schema: widget, body: { name: 'n' }, idempotencyKey: 'k1' }),
    ).toEqual({ id: 'x' });
    expect(g.calls).toHaveLength(2);
    expect((g.calls[1]!.init.headers as Record<string, string>)['idempotency-key']).toBe('k1');
  });

  it('times out slow responses and surfaces network errors as VendorError', async () => {
    const f = fakeFetch([{ status: 200, body: { id: 'late' }, delayMs: 500 }]);
    const client = createVendorClient({
      name: 'acme',
      baseUrl: 'https://api.acme.test',
      fetchImpl: f.impl,
      timeoutMs: 50,
      retries: 1,
    });
    await expect(client.get('slow', { schema: widget })).rejects.toMatchObject({
      name: 'VendorError',
      status: 0,
    });
    const g = fakeFetch([new Error('ECONNRESET')]);
    const client2 = createVendorClient({
      name: 'acme',
      baseUrl: 'https://api.acme.test',
      fetchImpl: g.impl,
      retries: 1,
    });
    await expect(client2.get('x', { schema: widget })).rejects.toMatchObject({
      status: 0,
      body: 'ECONNRESET',
    });
  });
});
