import type { FileRecord } from '@/shared/files';

/**
 * Everything about a file that is presentation only: how big it reads, what kind of
 * thing it is, and whether the browser will show it or save it. Kept away from React
 * so a cell, a form and a test can all use it.
 */

const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Human file size, base 1024 with the short labels people expect next to a filename.
 * Whole numbers below 1 KB, one decimal above it unless it would read `1.0`.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${units[unit]}`;
}

export type FileKind = 'image' | 'pdf' | 'spreadsheet' | 'archive' | 'text' | 'other';

/** Coarse buckets, one per icon. The server's allowlist is the real classification. */
export function fileKind(contentType: string): FileKind {
  const type = contentType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (type === 'text/csv' || type.includes('spreadsheet') || type.includes('ms-excel'))
    return 'spreadsheet';
  if (type === 'application/zip' || type === 'application/x-zip-compressed') return 'archive';
  if (type.startsWith('text/') || type === 'application/json') return 'text';
  return 'other';
}

/**
 * Matches the server's `Content-Disposition`: images and PDF are shown in a tab, the
 * rest are saved. Used to decide between a link that opens and one that downloads.
 */
export function isInline(contentType: string): boolean {
  const kind = fileKind(contentType);
  return kind === 'image' || kind === 'pdf';
}

export function isImage(file: Pick<FileRecord, 'contentType'>): boolean {
  return fileKind(file.contentType) === 'image';
}

/**
 * Does a picked file satisfy an `accept` attribute? The browser enforces this in its
 * own file dialog but not on a drop, so the picker checks it again.
 */
export function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const patterns = accept
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (patterns.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return patterns.some((pattern) => {
    if (pattern.startsWith('.')) return name.endsWith(pattern);
    if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1));
    return type === pattern;
  });
}
