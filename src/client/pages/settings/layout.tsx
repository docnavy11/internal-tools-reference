import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { isNavEntryActive, useNavEntries } from '@/client/platform/shell/nav';
import { NoAccessPage } from '@/client/platform/shell/states';
import { cn } from '@/client/lib/utils';

// The settings area: its own sub-navigation, built from the `settings` nav group so a
// new settings page appears here and in the sidebar from one registry entry.
export function SettingsLayout() {
  const entries = useNavEntries('settings');
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      {entries.length > 0 ? (
        <nav aria-label="Settings" className="md:w-40 md:shrink-0">
          <ul className="flex gap-1 md:flex-col">
            {entries.map((entry) => (
              <li key={entry.to}>
                <Link
                  to={entry.to}
                  aria-current={isNavEntryActive(entry, pathname) ? 'page' : undefined}
                  className={cn(
                    'hover:bg-muted flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm',
                    isNavEntryActive(entry, pathname) && 'bg-muted font-medium',
                  )}
                >
                  <entry.icon className="size-4" />
                  {entry.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

/** `/settings` itself has no content: send the user to the first page they may see. */
export function SettingsIndexRedirect() {
  const entries = useNavEntries('settings');
  const first = entries[0];
  return first ? <Navigate to={first.to} replace /> : <NoAccessPage />;
}
