import {
  DownloadIcon,
  ExternalLinkIcon,
  FileArchiveIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/client/lib/utils';
import { fileKind, formatBytes, isInline, type FileKind } from '@/client/platform/files/format';
import type { FileRecord } from '@/shared/files';

/**
 * One attached file, anywhere a record shows its attachments. A plain `<a>` pointing at
 * `file.url` (`/api/files/:id`): the browser sends the session cookie, the server checks
 * the read permission of the owning entity and streams the bytes. No fetch, no blob URL,
 * so downloads and "open in a new tab" behave the way the browser's own do.
 */

const icons: Record<FileKind, LucideIcon> = {
  image: ImageIcon,
  pdf: FileTextIcon,
  spreadsheet: FileSpreadsheetIcon,
  archive: FileArchiveIcon,
  text: FileTextIcon,
  other: FileIcon,
};

export function AttachmentLink({ file, className }: { file: FileRecord; className?: string }) {
  const kind = fileKind(file.contentType);
  const Icon = icons[kind];
  const inline = isInline(file.contentType);

  return (
    <a
      data-slot="attachment-link"
      href={file.url}
      // Images and PDF are served inline, so they open; everything else is saved with
      // the name it was uploaded under.
      {...(inline
        ? { target: '_blank', rel: 'noreferrer' }
        : { download: file.filename, rel: 'noreferrer' })}
      className={cn(
        'group bg-card hover:bg-accent/50 inline-flex max-w-sm items-center gap-3 rounded-lg border p-2 text-sm transition-colors',
        'focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-3',
        className,
      )}
    >
      {kind === 'image' ? (
        <img
          src={file.url}
          alt=""
          loading="lazy"
          className="bg-muted size-10 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
          <Icon className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{file.filename}</span>
        <span className="text-muted-foreground block text-xs">{formatBytes(file.sizeBytes)}</span>
      </span>
      <span aria-hidden className="text-muted-foreground group-hover:text-foreground shrink-0 pr-1">
        {inline ? <ExternalLinkIcon className="size-4" /> : <DownloadIcon className="size-4" />}
      </span>
    </a>
  );
}
