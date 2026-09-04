// Content type from the first bytes, not from the client. Unknown binary becomes
// application/octet-stream and is always served as a download.

const signatures: { type: string; ext: string; match: (b: Buffer) => boolean }[] = [
  {
    type: 'image/png',
    ext: 'png',
    match: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { type: 'image/jpeg', ext: 'jpg', match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/gif', ext: 'gif', match: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  {
    type: 'image/webp',
    ext: 'webp',
    match: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    type: 'application/pdf',
    ext: 'pdf',
    match: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  {
    type: 'application/zip',
    ext: 'zip',
    match: (b) =>
      b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07),
  },
];

// Zip containers that are really Office documents; decided by filename since the
// container signature is the same.
const zipByExtension: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const textByExtension: Record<string, string> = {
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  log: 'text/plain',
};

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
}

function looksLikeText(sample: Buffer): boolean {
  if (sample.length === 0) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20 && byte !== 0x1b)) suspicious += 1;
  }
  return suspicious / sample.length < 0.05;
}

export function sniffContentType(bytes: Buffer, filename: string): string {
  const head = bytes.subarray(0, 16);
  for (const sig of signatures) {
    if (sig.match(head)) {
      if (sig.type === 'application/zip')
        return zipByExtension[extensionOf(filename)] ?? 'application/zip';
      return sig.type;
    }
  }
  const ext = extensionOf(filename);
  if (looksLikeText(bytes.subarray(0, 4096))) return textByExtension[ext] ?? 'text/plain';
  return 'application/octet-stream';
}

// Inline in the browser only for types that render safely; everything else downloads.
export function isInlineType(contentType: string): boolean {
  return contentType.startsWith('image/') || contentType === 'application/pdf';
}
