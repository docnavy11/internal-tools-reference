import { zodResolver } from '@hookform/resolvers/zod';
import {
  FormProvider,
  useForm,
  type DefaultValues,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ApiRequestError } from '@/client/platform/api/client';
import { errorMessage, errorRequestId } from '@/client/platform/api/errors';
import { Button } from '@/client/platform/ui/button';

/**
 * The form every entity uses. It validates with the shared Zod schema, so the client
 * refuses what the server would refuse, and it maps the server's 400 `fieldErrors`
 * (Zod `flatten()`) back onto the fields when the two disagree anyway.
 *
 * Fields are children and bind themselves by `name` through the form context, so a
 * form is a list of `<TextField name="…" label="…" />` and nothing else.
 */
export interface EntityFormProps<TIn extends FieldValues, TOut extends FieldValues, TResult> {
  /** The entity's input schema from `src/shared/features/<name>/schema.ts`. */
  schema: z.ZodType<TOut, z.ZodTypeDef, TIn>;
  defaultValues: DefaultValues<TIn>;
  /** Does the request. Throw to show the error; resolve to toast and continue. */
  onSubmit: (values: TOut) => Promise<TResult>;
  onSuccess?: (result: TResult) => void;
  successMessage: string;
  submitLabel?: string;
  /** Rendered next to the submit button, usually a link back to where we came from. */
  secondaryAction?: React.ReactNode;
  children: React.ReactNode;
}

export function EntityForm<TIn extends FieldValues, TOut extends FieldValues, TResult>({
  schema,
  defaultValues,
  onSubmit,
  onSuccess,
  successMessage,
  submitLabel = 'Save',
  secondaryAction,
  children,
}: EntityFormProps<TIn, TOut, TResult>) {
  const form = useForm<TIn, unknown, TOut>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const submit = async (values: TOut) => {
    try {
      const result = await onSubmit(values);
      toast.success(successMessage);
      onSuccess?.(result);
    } catch (error) {
      applyServerErrors(form, error);
    }
  };

  const rootError = form.formState.errors.root?.message;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate className="max-w-2xl space-y-6">
        <fieldset disabled={form.formState.isSubmitting} className="space-y-5">
          {children}
        </fieldset>

        {rootError ? (
          <p role="alert" className="text-destructive text-sm">
            {rootError}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving…' : submitLabel}
          </Button>
          {secondaryAction}
        </div>
      </form>
    </FormProvider>
  );
}

/**
 * A 400 carries Zod's `flatten()` in `details`: `fieldErrors` per field and
 * `formErrors` for the whole body. Anything else is a toast with the request id, so a
 * person can quote it in a bug report.
 */
function applyServerErrors<TIn extends FieldValues, TOut extends FieldValues>(
  form: UseFormReturn<TIn, unknown, TOut>,
  error: unknown,
) {
  if (error instanceof ApiRequestError && error.status === 400) {
    const details = error.details as { formErrors?: string[] } | undefined;
    let matched = false;
    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      const message = messages?.join(' ');
      if (!message) continue;
      matched = true;
      form.setError(field as Path<TIn>, { type: 'server', message });
    }
    const formErrors = details?.formErrors?.join(' ');
    if (formErrors || !matched) {
      form.setError('root', {
        type: 'server',
        message: formErrors || errorMessage(error, 'Some fields need attention.'),
      });
    }
    return;
  }

  const requestId = errorRequestId(error);
  form.setError('root', { type: 'server', message: errorMessage(error) });
  toast.error(errorMessage(error, 'Could not save.'), {
    description: requestId ? `Request ${requestId}` : undefined,
  });
}
