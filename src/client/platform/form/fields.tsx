import { useId, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { CheckIcon, XIcon } from 'lucide-react';
import { cn } from '@/client/lib/utils';
import { useUserOptions, userOptionLabel } from '@/client/platform/api/user-options';
import { FilePicker } from '@/client/platform/files';
import { Badge } from '@/client/platform/ui/badge';
import { Button } from '@/client/platform/ui/button';
import { Checkbox } from '@/client/platform/ui/checkbox';
import { Input } from '@/client/platform/ui/input';
import { Label } from '@/client/platform/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/client/platform/ui/popover';
import { ScrollArea } from '@/client/platform/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/platform/ui/select';
import { Textarea } from '@/client/platform/ui/textarea';

/**
 * Form fields. Each one binds itself to `name` through the form context, renders its
 * own label, description and error, and does nothing else. Add a field type here rather
 * than writing bespoke inputs in a feature.
 */
export interface FieldProps {
  name: string;
  label: string;
  description?: string;
  placeholder?: string;
}

function FieldShell({
  id,
  label,
  description,
  error,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  name,
  label,
  description,
  placeholder,
  type = 'text',
  nullable = false,
  autoFocus,
}: FieldProps & {
  type?: 'text' | 'email' | 'url' | 'tel';
  nullable?: boolean;
  autoFocus?: boolean;
}) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell
          id={name}
          label={label}
          description={description}
          error={fieldState.error?.message}
        >
          <Input
            id={name}
            type={type}
            autoFocus={autoFocus}
            placeholder={placeholder}
            aria-invalid={!!fieldState.error}
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={field.value ?? ''}
            onChange={(event) =>
              field.onChange(nullable && event.target.value === '' ? null : event.target.value)
            }
          />
        </FieldShell>
      )}
    />
  );
}

export function TextareaField({
  name,
  label,
  description,
  placeholder,
  rows = 4,
  nullable = false,
}: FieldProps & { rows?: number; nullable?: boolean }) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell
          id={name}
          label={label}
          description={description}
          error={fieldState.error?.message}
        >
          <Textarea
            id={name}
            rows={rows}
            placeholder={placeholder}
            aria-invalid={!!fieldState.error}
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={field.value ?? ''}
            onChange={(event) =>
              field.onChange(nullable && event.target.value === '' ? null : event.target.value)
            }
          />
        </FieldShell>
      )}
    />
  );
}

export function NumberField({
  name,
  label,
  description,
  placeholder,
  min,
  max,
  step,
}: FieldProps & { min?: number; max?: number; step?: number }) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell
          id={name}
          label={label}
          description={description}
          error={fieldState.error?.message}
        >
          <Input
            id={name}
            type="number"
            min={min}
            max={max}
            step={step}
            placeholder={placeholder}
            aria-invalid={!!fieldState.error}
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={field.value ?? ''}
            // An empty box is "no number", not zero.
            onChange={(event) =>
              field.onChange(event.target.value === '' ? null : Number(event.target.value))
            }
          />
        </FieldShell>
      )}
    />
  );
}

export function SelectField({
  name,
  label,
  description,
  placeholder,
  options,
}: FieldProps & { options: { value: string; label: string }[] }) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell
          id={name}
          label={label}
          description={description}
          error={fieldState.error?.message}
        >
          <Select value={field.value ?? ''} onValueChange={field.onChange}>
            <SelectTrigger id={name} className="w-full" aria-invalid={!!fieldState.error}>
              <SelectValue placeholder={placeholder ?? 'Choose one'} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      )}
    />
  );
}

export function CheckboxField({ name, label, description }: FieldProps) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={name}
              checked={!!field.value}
              onCheckedChange={(checked) => field.onChange(!!checked)}
              aria-invalid={!!fieldState.error}
            />
            <Label htmlFor={name}>{label}</Label>
          </div>
          {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
          {fieldState.error ? (
            <p role="alert" className="text-destructive text-sm">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}

/**
 * One file, or none, bound as a `File | null` in the form values. The form that owns it
 * submits `multipart/form-data` through `apiUpload` rather than JSON, so validate the
 * field with `z.instanceof(File).nullable()` and build the `FormData` in the submit
 * handler. Size and type refusals are shown by the picker itself.
 */
export function FileField({
  name,
  label,
  description,
  accept,
  maxBytes,
}: FieldProps & { accept?: string; maxBytes?: number }) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell
          id={name}
          label={label}
          description={description}
          error={fieldState.error?.message}
        >
          <FilePicker
            id={name}
            accept={accept}
            maxBytes={maxBytes}
            aria-invalid={!!fieldState.error}
            value={(field.value as File | null) ?? null}
            onChange={(file) => field.onChange(file)}
          />
        </FieldShell>
      )}
    />
  );
}

/** Free-text chips for a `string[]` field. Enter or comma adds, backspace removes. */
export function TagsField({ name, label, description, placeholder }: FieldProps) {
  const { control } = useFormContext();
  const [draft, setDraft] = useState('');

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const values: string[] = Array.isArray(field.value) ? field.value : [];

        const add = (raw: string) => {
          const value = raw.trim();
          if (!value || values.includes(value)) return setDraft('');
          field.onChange([...values, value]);
          setDraft('');
        };

        return (
          <FieldShell
            id={name}
            label={label}
            description={description}
            error={fieldState.error?.message}
          >
            <div className="space-y-2">
              {values.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {values.map((value) => (
                    <Badge key={value} variant="secondary" className="gap-1 font-normal">
                      {value}
                      <button
                        type="button"
                        aria-label={`Remove ${value}`}
                        className="hover:text-foreground text-muted-foreground -mr-1 rounded-sm p-0.5"
                        onClick={() => field.onChange(values.filter((entry) => entry !== value))}
                      >
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
              <Input
                id={name}
                placeholder={placeholder ?? 'Type and press Enter'}
                aria-invalid={!!fieldState.error}
                value={draft}
                onBlur={() => {
                  field.onBlur();
                  add(draft);
                }}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',') {
                    // Enter must not submit the form while a tag is being typed.
                    event.preventDefault();
                    add(draft);
                  } else if (event.key === 'Backspace' && draft === '' && values.length > 0) {
                    field.onChange(values.slice(0, -1));
                  }
                }}
              />
            </div>
          </FieldShell>
        );
      }}
    />
  );
}

/** One colleague or nobody. Options come from `/api/users/options`. */
export function UserPickerField({ name, label, description, placeholder }: FieldProps) {
  const { control } = useFormContext();
  const users = useUserOptions();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchId = useId();

  const term = search.trim().toLowerCase();
  const options = (users.data ?? []).filter(
    (user) => !term || userOptionLabel(user).toLowerCase().includes(term),
  );

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selected = users.data?.find((user) => user.id === field.value);
        return (
          <FieldShell
            id={name}
            label={label}
            description={description}
            error={fieldState.error?.message}
          >
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  id={name}
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                  aria-invalid={!!fieldState.error}
                >
                  {selected ? (
                    userOptionLabel(selected)
                  ) : (
                    <span className="text-muted-foreground">{placeholder ?? 'Nobody'}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-2">
                <Input
                  id={searchId}
                  autoFocus
                  type="search"
                  placeholder="Search people"
                  className="h-8"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <ScrollArea className={cn('mt-2', options.length > 8 && 'h-56')}>
                  <div className="space-y-0.5 pr-2">
                    <PickerOption
                      label="Nobody"
                      selected={!field.value}
                      onSelect={() => {
                        field.onChange(null);
                        setOpen(false);
                      }}
                    />
                    {users.isPending ? (
                      <p className="text-muted-foreground px-2 py-1.5 text-sm">Loading…</p>
                    ) : (
                      options.map((user) => (
                        <PickerOption
                          key={user.id}
                          label={userOptionLabel(user)}
                          selected={field.value === user.id}
                          onSelect={() => {
                            field.onChange(user.id);
                            setOpen(false);
                          }}
                        />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </FieldShell>
        );
      }}
    />
  );
}

function PickerOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
    >
      <CheckIcon className={cn('size-4', !selected && 'invisible')} />
      <span className="truncate">{label}</span>
    </button>
  );
}
