import {
  HomeIcon,
  ListChecksIcon,
  ScrollTextIcon,
  SlidersHorizontalIcon,
  UsersIcon,
  WebhookIcon,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '@/client/platform/auth/session';
import type { Permission } from '@/shared/permissions';
// One import line per feature that appears in the navigation.
import { customersNav } from '@/client/features/customers/nav';

// The navigation registry. A feature exports a `nav` object from
// `client/features/<name>/nav.ts` and is added to `navEntries` with one import line;
// nothing else in the shell changes. Entries the user lacks the permission for are
// hidden (convenience only: the server checks the same permission).

export const navGroups = ['main', 'settings'] as const;
export type NavGroup = (typeof navGroups)[number];

export interface NavEntry {
  label: string;
  icon: LucideIcon;
  to: string;
  permission?: Permission;
  group: NavGroup;
  /** Ascending; leave gaps of 10 so a new entry can slot in without renumbering. */
  order: number;
}

export const navGroupLabels: Record<NavGroup, string> = {
  main: 'Application',
  settings: 'Settings',
};

export const navEntries: NavEntry[] = [
  { label: 'Home', icon: HomeIcon, to: '/', group: 'main', order: 10 },
  customersNav,
  {
    // First in the settings area, and so where `/settings` lands for an admin.
    label: 'General',
    icon: SlidersHorizontalIcon,
    to: '/settings/general',
    permission: 'settings:manage',
    group: 'settings',
    order: 5,
  },
  {
    label: 'Users',
    icon: UsersIcon,
    to: '/settings/users',
    permission: 'users:manage',
    group: 'settings',
    order: 10,
  },
  {
    label: 'Audit log',
    icon: ScrollTextIcon,
    to: '/settings/audit',
    permission: 'audit:read',
    group: 'settings',
    order: 20,
  },
  {
    label: 'Jobs',
    icon: ListChecksIcon,
    to: '/settings/jobs',
    permission: 'jobs:manage',
    group: 'settings',
    order: 30,
  },
  {
    label: 'Webhooks',
    icon: WebhookIcon,
    to: '/settings/webhooks',
    permission: 'jobs:manage',
    group: 'settings',
    order: 40,
  },
];

/** The entries in one group that the signed-in user may see, in `order`. */
export function useNavEntries(group: NavGroup): NavEntry[] {
  const { permissions } = useSession();
  return navEntries
    .filter((entry) => entry.group === group)
    .filter((entry) => !entry.permission || permissions.includes(entry.permission))
    .sort((a, b) => a.order - b.order);
}

/** Every entry the user may see, across groups, in sidebar order. For the palette. */
export function useVisibleNavEntries(): NavEntry[] {
  const { permissions } = useSession();
  return navEntries
    .filter((entry) => !entry.permission || permissions.includes(entry.permission))
    .sort((a, b) => navGroups.indexOf(a.group) - navGroups.indexOf(b.group) || a.order - b.order);
}

/** True when `pathname` is inside the section an entry points at. */
export function isNavEntryActive(entry: NavEntry, pathname: string): boolean {
  if (entry.to === '/') return pathname === '/';
  return pathname === entry.to || pathname.startsWith(`${entry.to}/`);
}
