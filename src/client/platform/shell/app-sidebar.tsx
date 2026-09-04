import { Link, useLocation } from 'react-router';
import { BoxesIcon } from 'lucide-react';
import {
  isNavEntryActive,
  navGroupLabels,
  navGroups,
  useNavEntries,
} from '@/client/platform/shell/nav';
import type { NavGroup } from '@/client/platform/shell/nav';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/client/platform/ui/sidebar';

function NavGroupSection({ group }: { group: NavGroup }) {
  const entries = useNavEntries(group);
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  if (entries.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{navGroupLabels[group]}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {entries.map((entry) => (
            <SidebarMenuItem key={entry.to}>
              <SidebarMenuButton
                asChild
                isActive={isNavEntryActive(entry, pathname)}
                tooltip={entry.label}
              >
                <Link to={entry.to} onClick={() => isMobile && setOpenMobile(false)}>
                  <entry.icon />
                  <span>{entry.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Internal tools">
              <Link to="/">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <BoxesIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">Internal tools</span>
                  <span className="text-sidebar-foreground/60 truncate text-xs">Reference</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <NavGroupSection key={group} group={group} />
        ))}
      </SidebarContent>
      <SidebarFooter />
      <SidebarRail />
    </Sidebar>
  );
}
