import { AlertCircleIcon, SlidersHorizontalIcon } from 'lucide-react';
import { errorMessage } from '@/client/platform/api/errors';
import { EmptyState } from '@/client/platform/shell/empty-state';
import { PageHeader } from '@/client/platform/shell/page-header';
import { Button } from '@/client/platform/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/client/platform/ui/card';
import { Skeleton } from '@/client/platform/ui/skeleton';
import type { Setting } from '@/shared/settings';
import { useSettings } from '@/client/pages/settings/general-api';
import { SettingRow } from '@/client/pages/settings/general-row';

/**
 * General settings: the registry rendered as it comes, one card per `group`. The page
 * knows nothing about any particular key — the server decides which settings exist,
 * what they are called and which control each one needs.
 */
export function SettingsGeneralPage() {
  const query = useSettings();

  return (
    <>
      <PageHeader
        title="General"
        description="Behaviour you can change without a deploy. Each change takes effect within seconds and is recorded in the audit log."
      />
      {query.isPending ? (
        <Skeletons />
      ) : query.isError ? (
        <Card>
          <EmptyState
            icon={AlertCircleIcon}
            title={errorMessage(query.error, 'Could not load the settings.')}
            action={
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : (
        <Groups settings={query.data ?? []} />
      )}
    </>
  );
}

function Groups({ settings }: { settings: Setting[] }) {
  if (settings.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={SlidersHorizontalIcon}
          title="No settings"
          description="Settings are declared in code with defineSettings and appear here as soon as one exists."
        />
      </Card>
    );
  }

  // The server sorts by group then key, so first appearance is the group order and
  // the members of a group are already together.
  const groups = new Map<string, Setting[]>();
  for (const setting of settings) {
    const existing = groups.get(setting.group);
    if (existing) existing.push(setting);
    else groups.set(setting.group, [setting]);
  }

  return (
    <div className="space-y-6">
      {[...groups].map(([group, entries]) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle>
              <h2>{group}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {entries.map((setting) => (
              <SettingRow key={setting.key} setting={setting} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Skeletons() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 2 }, (_, card) => (
        <Card key={card}>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {Array.from({ length: 3 }, (_, row) => (
              <Skeleton key={row} className="h-9 w-full" />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
