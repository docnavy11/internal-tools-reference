import { useRef, useState } from 'react';
import { Loader2Icon, RotateCcwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { RelativeTime } from '@/client/platform/shell/relative-time';
import { Button } from '@/client/platform/ui/button';
import { Input } from '@/client/platform/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/platform/ui/select';
import { Switch } from '@/client/platform/ui/switch';
import type { Setting } from '@/shared/settings';
import {
  formatSettingValue,
  settingErrorMessage,
  settingInputText,
  useSaveSetting,
} from '@/client/pages/settings/general-api';

/**
 * One registry entry: what it is on the left, the control the type asks for on the
 * right. No setting has UI code of its own, so adding a key to the registry is enough
 * to make it editable here.
 *
 * A change is committed as soon as the user is done with it — a switch on its toggle,
 * a select on its choice, an input on blur or Enter — because the page is a list of
 * unrelated values, not a form with one save button. A value the server rejects is
 * reported on the control itself and the control goes back to what the server holds:
 * nothing on this page is ever left showing a value that was not stored.
 */

/** What a control does with a value the user settled on. `true` when it was stored. */
type Commit = (value: unknown) => Promise<boolean>;
/** Reported without asking the server, for input text that is not a value at all. */
type Fail = (message: string) => void;

interface ControlProps {
  setting: Setting;
  busy: boolean;
  commit: Commit;
  fail: Fail;
}

export function SettingRow({ setting }: { setting: Setting }) {
  const save = useSaveSetting();
  const [error, setError] = useState<string | null>(null);
  const descriptionId = `setting-${setting.key}-description`;

  const commit: Commit = async (value) => {
    setError(null);
    try {
      const saved = await save.mutateAsync({ key: setting.key, value });
      toast.success(`${setting.label} saved.`, {
        description:
          value === null
            ? 'Back on the default from the code.'
            : `Now ${formatSettingValue(saved.value)}.`,
      });
      return true;
    } catch (caught) {
      setError(settingErrorMessage(caught));
      return false;
    }
  };

  const controlProps: ControlProps = { setting, busy: save.isPending, commit, fail: setError };

  return (
    <div
      data-testid={`setting-${setting.key}`}
      className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b py-4 last:border-b-0 last:pb-0"
    >
      <div className="min-w-0 flex-1 basis-64 space-y-1">
        <p className="text-sm font-medium">{setting.label}</p>
        {setting.description ? (
          <p id={descriptionId} className="text-muted-foreground text-sm">
            {setting.description}
          </p>
        ) : null}
        {/* Only an overridden setting has anything to say here: what the code would
            do instead, who decided otherwise, and the way back. */}
        {setting.overridden ? (
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
            <span data-testid="setting-default">
              Default: {formatSettingValue(setting.default)}
            </span>
            <Button
              variant="link"
              size="sm"
              className="text-muted-foreground h-auto p-0 text-xs"
              disabled={save.isPending}
              onClick={() => void commit(null)}
            >
              <RotateCcwIcon />
              Reset to default
            </Button>
            {setting.updatedAt ? (
              <span>
                Changed by {setting.updatedBy?.name ?? setting.updatedBy?.email ?? 'someone'}{' '}
                <RelativeTime value={setting.updatedAt} />
              </span>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p data-testid="setting-error" className="text-destructive text-xs">
            {error}
          </p>
        ) : null}
      </div>

      {/* Nothing but the control sits at the right edge, so every control in the card
          ends on the same line whatever its type. */}
      <div className="flex shrink-0 items-center gap-2">
        {save.isPending ? (
          <span className="text-muted-foreground flex items-center gap-1 text-xs" role="status">
            <Loader2Icon className="size-3 animate-spin" />
            Saving…
          </span>
        ) : null}
        <SettingControl
          {...controlProps}
          describedBy={setting.description ? descriptionId : undefined}
        />
      </div>
    </div>
  );
}

function SettingControl({
  describedBy,
  ...props
}: ControlProps & { describedBy: string | undefined }) {
  switch (props.setting.type) {
    case 'boolean':
      return <BooleanControl {...props} describedBy={describedBy} />;
    case 'enum':
      return <EnumControl {...props} describedBy={describedBy} />;
    case 'number':
      return <TextControl {...props} describedBy={describedBy} numeric />;
    case 'string':
      return <TextControl {...props} describedBy={describedBy} />;
  }
}

function BooleanControl({
  setting,
  busy,
  commit,
  describedBy,
}: ControlProps & { describedBy: string | undefined }) {
  return (
    <Switch
      checked={setting.value === true}
      disabled={busy}
      aria-label={setting.label}
      aria-describedby={describedBy}
      onCheckedChange={(checked) => void commit(checked)}
    />
  );
}

function EnumControl({
  setting,
  busy,
  commit,
  describedBy,
}: ControlProps & { describedBy: string | undefined }) {
  return (
    <Select
      value={settingInputText(setting.value)}
      disabled={busy}
      onValueChange={(value) => void commit(value)}
    >
      <SelectTrigger
        size="sm"
        className="w-48"
        aria-label={setting.label}
        aria-describedby={describedBy}
      >
        <SelectValue placeholder={setting.label} />
      </SelectTrigger>
      <SelectContent>
        {(setting.options ?? []).map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Text and numbers share a control: the only difference is that a number is parsed
 * here, because `JSON.stringify(NaN)` is `null` and `null` is how this API says
 * "remove the override". An unparseable box never reaches the server.
 */
function TextControl({
  setting,
  busy,
  commit,
  fail,
  describedBy,
  numeric = false,
}: ControlProps & { describedBy: string | undefined; numeric?: boolean }) {
  const stored = settingInputText(setting.value);
  const [draft, setDraft] = useState(stored);
  // What the server last told us. When that changes (a save, a reset, a refetch) the
  // box follows it; while it stays put the user's typing is left alone.
  const [synced, setSynced] = useState(stored);
  if (synced !== stored) {
    setSynced(stored);
    setDraft(stored);
  }

  // Enter commits, and the blur that follows (including the one from disabling the
  // box while the request is in flight) would commit the same text again.
  const submitted = useRef<string | null>(null);

  const submit = async (raw: string) => {
    if (busy || submitted.current === raw || raw === stored) return;
    if (numeric) {
      const parsed = Number(raw.trim());
      if (raw.trim() === '' || !Number.isFinite(parsed)) {
        fail('Enter a number.');
        setDraft(stored);
        return;
      }
      submitted.current = raw;
      const ok = await commit(parsed);
      submitted.current = null;
      if (!ok) setDraft(stored);
      return;
    }
    submitted.current = raw;
    const ok = await commit(raw);
    submitted.current = null;
    if (!ok) setDraft(stored);
  };

  return (
    <Input
      type={numeric ? 'number' : 'text'}
      inputMode={numeric ? 'numeric' : undefined}
      className="h-8 w-48"
      value={draft}
      disabled={busy}
      aria-label={setting.label}
      aria-describedby={describedBy}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => void submit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void submit(event.currentTarget.value);
        }
        if (event.key === 'Escape') setDraft(stored);
      }}
    />
  );
}
