import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { SearchIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/client/lib/utils';
import { useSession } from '@/client/platform/auth/session';
import { useVisibleNavEntries } from '@/client/platform/shell/nav';
import { paletteSources } from '@/client/platform/shell/palette-registry';
import { Button } from '@/client/platform/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/client/platform/ui/dialog';
import { Input } from '@/client/platform/ui/input';
// One import line per feature that adds a source to the palette.
import '@/client/features/customers/palette';

/**
 * Ctrl/Cmd+K search over the navigation and, per feature that registered a source, over
 * its records. Built from `Dialog` and `Input` plus a plain list: the list is not
 * focusable, the input keeps focus and moves an `aria-activedescendant` marker, which is
 * the smallest thing that gives arrow keys, Enter and Escape the behaviour people expect.
 */

/** Records are only searched once the query is worth a request. */
const MIN_QUERY = 2;
const DEBOUNCE_MS = 200;

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

interface PaletteItem {
  key: string;
  label: string;
  description?: string;
  to: string;
  icon?: LucideIcon;
}

function useDebounced(value: string, delay = DEBOUNCE_MS): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label="Search"
        className="text-muted-foreground gap-2 font-normal"
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
        <span className="hidden sm:inline">Search</span>
        <kbd className="bg-muted hidden rounded px-1 font-mono text-[10px] sm:inline">
          {isMac ? '⌘' : 'Ctrl '}K
        </kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[15vh] max-w-lg translate-y-0 gap-0 p-0 sm:max-w-lg"
        >
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Search pages and records. Use the arrow keys to choose and Enter to open.
          </DialogDescription>
          {/* Remounted on every open so the query, the results and the highlight start fresh. */}
          {open ? <PaletteBody onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { permissions } = useSession();
  const navEntries = useVisibleNavEntries();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const term = useDebounced(query).trim();

  // Sources the user may search. The server checks the same permission on every request.
  const sources = useMemo(
    () => paletteSources().filter((s) => !s.permission || permissions.includes(s.permission)),
    [permissions],
  );

  const searches = useQueries({
    queries: sources.map((source) => ({
      queryKey: ['palette', source.label, term],
      queryFn: () => source.search(term),
      enabled: term.length >= MIN_QUERY,
      staleTime: 30_000,
    })),
  });

  const typed = query.trim().toLowerCase();
  const sections: { label: string; items: PaletteItem[] }[] = [];

  const navItems = navEntries
    .filter((entry) => entry.label.toLowerCase().includes(typed))
    .map((entry) => ({ key: entry.to, label: entry.label, to: entry.to, icon: entry.icon }));
  if (navItems.length > 0) sections.push({ label: 'Navigation', items: navItems });

  sources.forEach((source, index) => {
    const items = (searches[index]?.data ?? []).map((result) => ({
      key: `${source.label}:${result.id}`,
      label: result.label,
      description: result.description,
      to: result.to,
    }));
    if (items.length > 0) sections.push({ label: source.label, items });
  });

  const items = sections.flatMap((section) => section.items);
  const activeIndex = items.length === 0 ? 0 : Math.min(active, items.length - 1);
  const searching = term.length >= MIN_QUERY && searches.some((search) => search.isFetching);

  const go = (to: string) => {
    onClose();
    void navigate(to);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((activeIndex + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((activeIndex - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) go(item.to);
    }
  };

  let index = -1;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <SearchIcon className="text-muted-foreground size-4 shrink-0" />
        <Input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls="palette-results"
          aria-activedescendant={items.length > 0 ? `palette-item-${activeIndex}` : undefined}
          aria-label="Search pages and records"
          placeholder="Search pages and records…"
          className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      <ul id="palette-results" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
        {items.length === 0 ? (
          <li className="text-muted-foreground px-2 py-6 text-center text-sm">
            {searching ? 'Searching…' : 'Nothing matches'}
          </li>
        ) : (
          sections.map((section) => (
            <li key={section.label} role="presentation">
              <p className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium">
                {section.label}
              </p>
              <ul role="group" aria-label={section.label}>
                {section.items.map((item) => {
                  index += 1;
                  const current = index;
                  return (
                    <li
                      key={item.key}
                      id={`palette-item-${current}`}
                      role="option"
                      aria-selected={current === activeIndex}
                      onClick={() => go(item.to)}
                      onMouseMove={() => setActive(current)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                        current === activeIndex && 'bg-muted',
                      )}
                    >
                      {item.icon ? (
                        <item.icon className="text-muted-foreground size-4 shrink-0" />
                      ) : null}
                      <span className="truncate">{item.label}</span>
                      {item.description ? (
                        <span className="text-muted-foreground ml-auto truncate text-xs">
                          {item.description}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
