import { Building2Icon } from 'lucide-react';
import type { NavEntry } from '@/client/platform/shell/nav';

// One entry, imported by `platform/shell/nav.ts`. Adding a feature to the sidebar is
// that one import line; nothing else in the shell changes.
export const customersNav: NavEntry = {
  label: 'Customers',
  icon: Building2Icon,
  to: '/customers',
  permission: 'customers:read',
  group: 'main',
  order: 20,
};
