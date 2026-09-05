import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import { EntityForm } from '@/client/platform/form';
import {
  SelectField,
  TagsField,
  TextField,
  TextareaField,
  UserPickerField,
} from '@/client/platform/form';
import { PageHeader } from '@/client/platform/shell/page-header';
import { Button } from '@/client/platform/ui/button';
import {
  customerInput,
  customerPlans,
  customerStatuses,
  type Customer,
} from '@/shared/features/customers/schema';
import { useCreateCustomer, useUpdateCustomer } from '@/client/features/customers/api';

/**
 * Create and edit share one set of fields and one schema (`customerInput`). The edit
 * form sends the whole object as a PATCH, which `customerPatch` accepts because it is a
 * partial of the same shape.
 */

// The form works in the schema's *input* type: fields with a `.default()` are optional
// there and required after validation, which is exactly what a half-filled form is.
type CustomerFormValues = z.input<typeof customerInput>;

const statusOptions = customerStatuses.map((status) => ({ value: status, label: status }));
const planOptions = customerPlans.map((plan) => ({ value: plan, label: plan }));

function CustomerFields() {
  return (
    <>
      <TextField name="name" label="Name" placeholder="Acme Inc." autoFocus />
      <TextField
        name="email"
        label="Email"
        type="email"
        nullable
        placeholder="billing@acme.com"
        description="Where invoices and product updates go. Optional."
      />
      <SelectField name="status" label="Status" options={statusOptions} />
      <SelectField name="plan" label="Plan" options={planOptions} />
      <TagsField
        name="tags"
        label="Tags"
        description="Free text, up to twenty. Press Enter after each one."
      />
      <UserPickerField
        name="ownerId"
        label="Owner"
        placeholder="Nobody"
        description="The colleague who looks after this account."
      />
      <TextareaField name="notes" label="Notes" nullable rows={5} />
    </>
  );
}

function CancelButton({ to }: { to: string }) {
  return (
    <Button asChild variant="ghost">
      <Link to={to}>Cancel</Link>
    </Button>
  );
}

export function CustomerCreatePage() {
  const navigate = useNavigate();
  const create = useCreateCustomer();

  return (
    <>
      <PageHeader title="New customer" description="Everything except the name is optional." />
      <EntityForm<CustomerFormValues, z.output<typeof customerInput>, Customer>
        schema={customerInput}
        defaultValues={{
          name: '',
          email: null,
          status: 'lead',
          plan: 'free',
          tags: [],
          ownerId: null,
          notes: null,
        }}
        onSubmit={(values) => create.mutateAsync(values)}
        successMessage="Customer created."
        onSuccess={(customer) => void navigate(`/customers/${customer.id}`)}
        submitLabel="Create customer"
        secondaryAction={<CancelButton to="/customers" />}
      >
        <CustomerFields />
      </EntityForm>
    </>
  );
}

/** Field values for editing an existing record. */
export function customerFormValues(record: Customer): CustomerFormValues {
  return {
    name: record.name,
    email: record.email,
    status: record.status,
    plan: record.plan,
    tags: record.tags,
    ownerId: record.owner?.id ?? null,
    notes: record.notes,
  };
}

/**
 * Editing happens on the detail page, in place: the Details tab swaps its field list for
 * this form and swaps back on save or cancel. There is no separate edit page.
 */
export function CustomerEditForm({ record, onDone }: { record: Customer; onDone: () => void }) {
  const update = useUpdateCustomer(record.id);
  return (
    <EntityForm<CustomerFormValues, z.output<typeof customerInput>, Customer>
      schema={customerInput}
      defaultValues={customerFormValues(record)}
      onSubmit={(values) => update.mutateAsync(values)}
      successMessage="Changes saved."
      onSuccess={onDone}
      submitLabel="Save changes"
      secondaryAction={
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      }
    >
      <CustomerFields />
    </EntityForm>
  );
}
