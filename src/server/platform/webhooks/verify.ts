import { createHmac, timingSafeEqual } from 'node:crypto';

// Signature verifiers. Each returns true when the request is authentic. They receive the
// raw body because signatures are computed over bytes, not over parsed JSON.

export type Verifier = (rawBody: string, headers: Headers) => boolean;

export interface HmacOptions {
  header: string; // e.g. 'x-vendor-signature'
  secret: string;
  prefix?: string; // e.g. 'sha256=' (stripped before comparing)
  // When set, the signature covers `${timestamp}.${body}` and the timestamp header must
  // be within toleranceSeconds of now (replay protection).
  timestampHeader?: string;
  toleranceSeconds?: number;
}

export function hmacSha256Header(opts: HmacOptions): Verifier {
  // An empty secret would let anyone forge a valid signature. Fail at construction, which
  // happens at boot when the integration registers, not on the first delivery.
  if (!opts.secret)
    throw new Error(`webhook verifier for header ${opts.header} has no secret configured`);
  return (rawBody, headers) => {
    const provided = headers.get(opts.header);
    if (!provided) return false;
    let signed = rawBody;
    if (opts.timestampHeader) {
      const ts = headers.get(opts.timestampHeader);
      if (!ts || !/^\d+$/.test(ts)) return false;
      const age = Math.abs(Date.now() / 1000 - Number(ts));
      if (age > (opts.toleranceSeconds ?? 300)) return false;
      signed = `${ts}.${rawBody}`;
    }
    const expected = createHmac('sha256', opts.secret).update(signed).digest('hex');
    const given =
      opts.prefix && provided.startsWith(opts.prefix)
        ? provided.slice(opts.prefix.length)
        : provided;
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(given.trim().toLowerCase(), 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  };
}

// For vendors that only offer a shared token in a header.
export function sharedTokenHeader(header: string, token: string): Verifier {
  if (!token) throw new Error(`webhook verifier for header ${header} has no token configured`);
  return (_body, headers) => {
    const given = headers.get(header) ?? '';
    const a = Buffer.from(token);
    const b = Buffer.from(given);
    return a.length === b.length && timingSafeEqual(a, b);
  };
}
