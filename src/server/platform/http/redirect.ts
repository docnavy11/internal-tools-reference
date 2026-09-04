// Only same-origin relative paths are accepted as post-login destinations. Whitespace and
// control characters are refused too: browsers strip tabs and newlines from URLs, which
// would turn "/<tab>/evil.test" into a protocol-relative redirect.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\s\\\u0000-\u001f\u007f]/;

export function safeRedirect(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (FORBIDDEN.test(value)) return fallback;
  return value;
}
