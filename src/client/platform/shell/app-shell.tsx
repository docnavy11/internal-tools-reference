import { Outlet } from 'react-router';
import { AppSidebar } from '@/client/platform/shell/app-sidebar';
import { RouteBreadcrumb } from '@/client/platform/shell/breadcrumbs';
import { ThemeToggle } from '@/client/platform/shell/theme';
import { UserMenu } from '@/client/platform/shell/user-menu';
import { Separator } from '@/client/platform/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/client/platform/ui/sidebar';

// The frame every authenticated page lives in: sidebar, top bar, content column.
export function AppShell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 !h-4" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <RouteBreadcrumb />
          </div>
          <ThemeToggle />
          <UserMenu />
        </header>
        <div className="min-w-0 flex-1 p-4 md:p-6">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
