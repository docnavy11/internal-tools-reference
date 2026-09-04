import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/client/platform/api/client';
import { useSession } from '@/client/platform/auth/session';
import { PageHeader } from '@/client/platform/shell/page-header';
import { navEntries } from '@/client/platform/shell/nav';
import { Badge } from '@/client/platform/ui/badge';
import { Button } from '@/client/platform/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/client/platform/ui/card';

export function HomePage() {
  const { user, permissions } = useSession();
  const destinations = navEntries
    .filter((entry) => entry.to !== '/')
    .filter((entry) => !entry.permission || permissions.includes(entry.permission))
    .sort((a, b) => a.order - b.order);

  return (
    <>
      <PageHeader
        title={`Welcome${user?.name ? `, ${user.name}` : ''}`}
        description="This is the reference template. Replace this page with your tool's landing page."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Where to go</CardTitle>
            <CardDescription>Everything your role can reach.</CardDescription>
          </CardHeader>
          <CardContent>
            {destinations.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing else is available to your role yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {destinations.map((entry) => (
                  <li key={entry.to}>
                    <Link
                      to={entry.to}
                      className="hover:bg-muted flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <entry.icon className="text-muted-foreground size-4" />
                      {entry.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <SystemStatusCard />
      </div>
    </>
  );
}

/** Kept from the phase 1 status page so the deployment smoke check stays honest. */
function SystemStatusCard() {
  const ready = useQuery({
    queryKey: ['readyz'],
    queryFn: () => api<{ ok: boolean; database: string }>('/readyz'),
    refetchInterval: 30_000,
  });

  const apiState = ready.isPending ? 'checking' : ready.isError ? 'unreachable' : 'up';
  const dbState = ready.data?.database ?? (ready.isError ? 'unknown' : 'checking');

  return (
    <Card>
      <CardHeader>
        <CardTitle>System status</CardTitle>
        <CardDescription>Live result of the readiness check.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-muted-foreground">API</dt>
          <dd>
            <Badge variant={apiState === 'up' ? 'default' : 'destructive'}>{apiState}</Badge>
          </dd>
          <dt className="text-muted-foreground">Database</dt>
          <dd>
            <Badge variant={dbState === 'up' ? 'default' : 'destructive'}>{dbState}</Badge>
          </dd>
        </dl>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void ready.refetch()}
          disabled={ready.isFetching}
        >
          Re-check
        </Button>
      </CardContent>
    </Card>
  );
}
