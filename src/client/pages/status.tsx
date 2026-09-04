import { useQuery } from '@tanstack/react-query';
import { api } from '@/client/platform/api/client';
import { Badge } from '@/client/platform/ui/badge';
import { Button } from '@/client/platform/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/client/platform/ui/card';

// Phase 1 placeholder. Proves routing, data fetching, Tailwind, shadcn components and
// the API proxy work together. Replaced by the real shell in phase 2.
export function StatusPage() {
  const ready = useQuery({
    queryKey: ['readyz'],
    queryFn: () => api<{ ok: boolean; database: string }>('/readyz'),
    refetchInterval: 5000,
  });

  const apiState = ready.isPending ? 'checking' : ready.isError ? 'unreachable' : 'up';
  const dbState = ready.data?.database ?? (ready.isError ? 'unknown' : 'checking');

  return (
    <main className="bg-background text-foreground flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Internal tools</CardTitle>
          <CardDescription>Phase 1 skeleton. The real shell arrives in phase 2.</CardDescription>
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
    </main>
  );
}
