import { HomeIcon, ScrollTextIcon, UsersIcon, type LucideIcon } from 'lucide-react';
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
];

/** The entries in one group that the signed-in user may see, in `order`. */
export function useNavEntries(group: NavGroup): NavEntry[] {
  const { permissions } = useSession();
  return navEntries
    .filter((entry) => entry.group === group)
    .filter((entry) => !entry.permission || permissions.includes(entry.permission))
    .sort((a, b) => a.order - b.order);
}

/** True when `pathname` is inside the section an entry points at. */
export function isNavEntryActive(entry: NavEntry, pathname: string): boolean {
  if (entry.to === '/') return pathname === '/';
  return pathname === entry.to || pathname.startsWith(`${entry.to}/`);
}
