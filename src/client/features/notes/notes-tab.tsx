import { useId, useState } from 'react';
import { AlertCircleIcon, MessageSquareIcon, MoreHorizontalIcon, SendIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ApiRequestError } from '@/client/platform/api/client';
import { errorMessage, errorRequestId, toastError } from '@/client/platform/api/errors';
import { usePermission, useSession } from '@/client/platform/auth/session';
import { AttachmentLink, FilePicker } from '@/client/platform/files';
import { ConfirmDialog } from '@/client/platform/shell/confirm-dialog';
import { EmptyState } from '@/client/platform/shell/empty-state';
import { RelativeTime } from '@/client/platform/shell/relative-time';
import { UserAvatar } from '@/client/platform/shell/user-avatar';
import { Button } from '@/client/platform/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/client/platform/ui/dropdown-menu';
import { Label } from '@/client/platform/ui/label';
import { Skeleton } from '@/client/platform/ui/skeleton';
import { Textarea } from '@/client/platform/ui/textarea';
import type { Note } from '@/shared/features/notes/schema';
import { useCreateNote, useDeleteNote, useNotes, useUpdateNote } from '@/client/features/notes/api';

/**
 * The notes of one customer, as a tab on its detail page. This is the reference for a
 * child entity: the parent id comes in as a prop, the API paths are nested under the
 * parent, and nothing here knows about routing.
 *
 * Who may do what: `notes:write` to post, and the author or an admin to edit and delete.
 * Both are also enforced by the server, which is the boundary; hiding the controls only
 * keeps people from clicking things that would 403.
 */

/** Mirrors the server's `UPLOAD_MAX_BYTES` default so an oversized file never leaves. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_BODY_LENGTH = 5000;
const PAGE_SIZE = 10;

export function NotesTab({ customerId }: { customerId: string }) {
  const notes = useNotes(customerId, PAGE_SIZE);
  const mayWrite = usePermission('notes:write');

  const items = notes.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      {mayWrite ? <NoteComposer customerId={customerId} /> : null}

      {notes.isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="space-y-2 rounded-lg border p-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
          ))}
        </div>
      ) : notes.isError ? (
        <EmptyState
          icon={AlertCircleIcon}
          title={errorMessage(notes.error, 'Could not load the notes.')}
          description={
            errorRequestId(notes.error) ? `Request ${errorRequestId(notes.error)}` : undefined
          }
          action={
            <Button variant="outline" size="sm" onClick={() => void notes.refetch()}>
              Try again
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={MessageSquareIcon}
          title="No notes yet"
          description={
            mayWrite
              ? 'Write the first one above. Notes can carry one attachment each.'
              : 'Nobody has written a note about this customer.'
          }
        />
      ) : (
        <ol className="space-y-4">
          {items.map((note) => (
            <li key={note.id}>
              <NoteCard note={note} customerId={customerId} />
            </li>
          ))}
        </ol>
      )}

      {notes.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          disabled={notes.isFetchingNextPage}
          onClick={() => void notes.fetchNextPage()}
        >
          {notes.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  );
}

function NoteComposer({ customerId }: { customerId: string }) {
  const create = useCreateNote(customerId);
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const bodyId = useId();
  const fileId = useId();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBodyError(null);
    setFileError(null);
    if (body.trim() === '') {
      setBodyError('Write something.');
      return;
    }
    try {
      await create.mutateAsync({ body: body.trim(), file });
      setBody('');
      setFile(null);
      toast.success('Note posted.');
    } catch (error) {
      // 400 puts per-field messages in `details.fieldErrors`; anything else is a toast.
      if (error instanceof ApiRequestError && error.code === 'validation_error') {
        setBodyError(error.fieldErrors.body?.join(' ') ?? null);
        setFileError(error.fieldErrors.file?.join(' ') ?? null);
        return;
      }
      toastError(error, 'Could not post this note.');
    }
  };

  return (
    <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => void submit(event)}>
      <div className="space-y-2">
        <Label htmlFor={bodyId}>Note</Label>
        <Textarea
          id={bodyId}
          rows={3}
          maxLength={MAX_BODY_LENGTH}
          placeholder="What happened?"
          aria-invalid={!!bodyError}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        {bodyError ? (
          <p role="alert" className="text-destructive text-sm">
            {bodyError}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={fileId}>Attachment</Label>
        <FilePicker
          id={fileId}
          value={file}
          onChange={setFile}
          maxBytes={MAX_ATTACHMENT_BYTES}
          disabled={create.isPending}
          aria-invalid={!!fileError}
          onError={() => setFileError(null)}
        />
        {fileError ? (
          <p role="alert" className="text-destructive text-sm">
            {fileError}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={create.isPending}>
          <SendIcon />
          Post note
        </Button>
        <span className="text-muted-foreground text-xs">
          {body.length} of {MAX_BODY_LENGTH} characters
        </span>
      </div>
    </form>
  );
}

function NoteCard({ note, customerId }: { note: Note; customerId: string }) {
  const { user } = useSession();
  const mayWrite = usePermission('notes:write');
  const update = useUpdateNote(customerId);
  const remove = useDeleteNote(customerId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Both routes ask for `notes:write` first, then the service allows only the author or
  // an admin. Someone demoted to viewer still owns their old notes but may no longer
  // change them, so the permission is part of the test and not just the authorship.
  const mine = !!user && note.author?.id === user.id;
  const mayManage = mayWrite && (mine || user?.role === 'admin');

  const save = async () => {
    if (draft.trim() === '') return;
    try {
      await update.mutateAsync({ id: note.id, body: draft.trim() });
      setEditing(false);
    } catch (error) {
      toastError(error, 'Could not save this note.');
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(note.id);
      setConfirmingDelete(false);
      toast.success('Note deleted.');
    } catch (error) {
      setConfirmingDelete(false);
      toastError(error, 'Could not delete this note.');
    }
  };

  return (
    <>
      <article data-slot="note" className="bg-card space-y-3 rounded-lg border p-4">
        <header className="flex items-start gap-3">
          <UserAvatar
            name={note.author?.name ?? null}
            email={note.author?.email ?? ''}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {note.author ? (note.author.name ?? note.author.email) : 'A deleted user'}
              {mine ? <span className="text-muted-foreground ml-2 text-xs">(you)</span> : null}
            </p>
            <p className="text-muted-foreground text-xs">
              <RelativeTime value={note.createdAt} />
              {note.updatedAt ? <span className="ml-2">edited</span> : null}
            </p>
          </div>
          {mayManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Note actions">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setDraft(note.body);
                    setEditing(true);
                  }}
                >
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </header>

        {editing ? (
          <div className="space-y-2">
            <Textarea
              aria-label="Edit note"
              rows={3}
              maxLength={MAX_BODY_LENGTH}
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={update.isPending || draft.trim() === ''}
                onClick={() => void save()}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={update.isPending}
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap">{note.body}</p>
        )}

        {note.attachment ? <AttachmentLink file={note.attachment} /> : null}
      </article>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this note?"
        description="The note and its attachment disappear from the list. An admin can still find it in the audit log."
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        onConfirm={() => void onDelete()}
      />
    </>
  );
}
