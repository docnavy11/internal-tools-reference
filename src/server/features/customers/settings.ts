import { z } from 'zod';
import { customerPlan } from '../../../shared/features/customers/schema';
import { defineSettings } from '../../platform/settings';

// Runtime-editable behaviour of the golden example. Admins change these at /settings/general.
export const customerSettings = defineSettings({
  'customers.slack_on_create': {
    schema: z.boolean(),
    default: true,
    label: 'Post to Slack when a customer is created',
    description: 'Uses the Slack driver and default channel from the environment.',
    group: 'Customers',
  },
  'customers.default_plan': {
    schema: customerPlan,
    default: 'free',
    label: 'Default plan for imported customers without one',
    group: 'Customers',
  },
  'customers.trash_days': {
    schema: z.number().int().min(1).max(3650),
    default: 30,
    label: 'Days before soft-deleted customers are purged',
    description: 'The nightly purge job removes customers deleted longer ago than this.',
    group: 'Customers',
  },
});
