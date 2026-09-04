import { useEffect, useId, useRef, useState } from 'react';
import { PaperclipIcon, XIcon } from 'lucide-react';
import { cn } from '@/client/lib/utils';
import { formatBytes, matchesAccept } from '@/client/platform/files/format';
import { Button } from '@/client/platform/ui/button';
import { Input } from '@/client/platform/ui/input';

/**
 * A controlled single-file input: the caller owns the `File | null`, this owns the DOM
 * input and the two things a person needs to see, which file is chosen and why one was
 * refused. Size and type are checked here so an obviously wrong file never leaves the
 * browser; the server checks both again and is the boundary.
 *
 * Drag and drop is a convenience over the same native input, so `setInputFiles` in a
 * test and a real drop go through one code path.
 */
export interface FilePickerProps {
  id?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  /** Same syntax as the input attribute: `image/*,.pdf`. Rechecked on drop. */
  accept?: string;
  /** Refuse anything larger before uploading. Mirror the server's `UPLOAD_MAX_BYTES`. */
  maxBytes?: number;
  disabled?: boolean;
  className?: string;
  /** Told about a client-side refusal so a form can clear its own message. */
  onError?: (message: string | null) => void;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export function FilePicker({
  id,
  value,
  onChange,
  accept,
  maxBytes,
  disabled = false,
  className,
  onError,
  'aria-invalid': ariaInvalid,
  'aria-describedby': describedBy,
}: FilePickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-file-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // The caller clearing the value (after a successful post, say) has to clear the DOM
  // input too, or the same file cannot be picked again.
  useEffect(() => {
    if (value === null && inputRef.current) inputRef.current.value = '';
  }, [value]);

  const refuse = (message: string) => {
    setError(message);
    onError?.(message);
    if (inputRef.current) inputRef.current.value = '';
    onChange(null);
  };

  const accepted = (file: File | null) => {
    if (file === null) {
      setError(null);
      onError?.(null);
      onChange(null);
      return;
    }
    if (maxBytes !== undefined && file.size > maxBytes) {
      refuse(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`);
      return;
    }
    if (!matchesAccept(file, accept)) {
      refuse(`${file.name} is not a file type this accepts.`);
      return;
    }
    setError(null);
    onError?.(null);
    onChange(file);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div
        data-slot="file-picker"
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (disabled) return;
          // Handle the drop here rather than letting the input take it, so the size and
          // type checks run for a dropped file too.
          event.preventDefault();
          setDragging(false);
          accepted(event.dataTransfer.files[0] ?? null);
        }}
        className={cn(
          'rounded-lg border border-dashed p-3 transition-colors',
          dragging ? 'border-ring bg-accent/50' : 'border-input',
          disabled && 'opacity-50',
        )}
      >
        <Input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          aria-invalid={ariaInvalid || !!error}
          aria-describedby={
            [describedBy, error ? errorId : null].filter(Boolean).join(' ') || undefined
          }
          className="h-auto border-0 px-0 py-0 shadow-none focus-visible:ring-0"
          onChange={(event) => accepted(event.target.files?.[0] ?? null)}
        />
        <p className="text-muted-foreground mt-1 text-xs">
          {value
            ? null
            : maxBytes
              ? `Drop a file here or choose one. Up to ${formatBytes(maxBytes)}.`
              : 'Drop a file here or choose one.'}
        </p>
      </div>

      {value ? (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <PaperclipIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            <span className="text-foreground font-medium">{value.name}</span> ·{' '}
            {formatBytes(value.size)}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2"
            disabled={disabled}
            onClick={() => accepted(null)}
          >
            <XIcon className="size-3.5" />
            Remove
          </Button>
        </div>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
