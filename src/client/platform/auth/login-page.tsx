import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { LogInIcon, MailCheckIcon, TriangleAlertIcon } from 'lucide-react';
import { api, apiSend, ApiRequestError } from '@/client/platform/api/client';
import { safeRedirectPath } from '@/client/platform/auth/redirect';
import { useSession } from '@/client/platform/auth/session';
import { LoadingPage } from '@/client/platform/shell/states';
import { Alert, AlertDescription, AlertTitle } from '@/client/platform/ui/alert';
import { Button } from '@/client/platform/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/client/platform/ui/card';
import { Input } from '@/client/platform/ui/input';
import { Label } from '@/client/platform/ui/label';
import { Separator } from '@/client/platform/ui/separator';
import {
  loginErrorCodes,
  loginErrorMessages,
  type AuthProvidersResponse,
  type LoginErrorCode,
} from '@/shared/auth';

function isLoginErrorCode(value: string | null): value is LoginErrorCode {
  return value !== null && (loginErrorCodes as readonly string[]).includes(value);
}

export function LoginPage() {
  const [params] = useSearchParams();
  const { status, refresh } = useSession();
  const navigate = useNavigate();

  const redirectTo = safeRedirectPath(params.get('redirect_to')) ?? '/';
  const errorCode = params.get('error');
  const errorMessage = isLoginErrorCode(errorCode) ? loginErrorMessages[errorCode] : null;

  const providers = useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: () => api<AuthProvidersResponse>('/api/auth/providers'),
  });

  if (status === 'loading') return <LoadingPage label="Checking your session" />;
  if (status === 'authenticated') return <Navigate to={redirectTo} replace />;

  const afterSignIn = async () => {
    await refresh();
    void navigate(redirectTo, { replace: true });
  };

  return (
    <main className="bg-background text-foreground flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="font-heading text-xl font-semibold">Internal tools</h1>
          <p className="text-muted-foreground text-sm">Sign in to continue.</p>
        </div>

        {errorMessage ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your work account or a sign-in link.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {providers.isPending ? (
              <p className="text-muted-foreground text-sm">Loading sign-in options…</p>
            ) : providers.isError ? (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertTitle>Sign-in is unavailable</AlertTitle>
                <AlertDescription>
                  The server did not answer. Try again in a moment.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {providers.data.oidc.length > 0 ? (
                  <div className="space-y-2">
                    {providers.data.oidc.map((provider) => (
                      <Button key={provider.id} asChild className="w-full" size="lg">
                        {/* Full-page navigation: the provider redirect must leave the SPA. */}
                        <a
                          href={`/api/auth/oidc/${provider.id}/start?redirect_to=${encodeURIComponent(redirectTo)}`}
                        >
                          <LogInIcon />
                          Continue with {provider.label}
                        </a>
                      </Button>
                    ))}
                  </div>
                ) : null}

                {providers.data.magicLink && providers.data.oidc.length > 0 ? <Separator /> : null}

                {providers.data.magicLink ? <MagicLinkForm redirectTo={redirectTo} /> : null}

                {providers.data.devLogin ? (
                  <>
                    <Separator />
                    <DevLoginForm onSignedIn={afterSignIn} />
                  </>
                ) : null}

                {providers.data.oidc.length === 0 &&
                !providers.data.magicLink &&
                !providers.data.devLogin ? (
                  <p className="text-muted-foreground text-sm">
                    No sign-in method is configured. Ask an administrator to set one up.
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function MagicLinkForm({ redirectTo }: { redirectTo: string }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <Alert>
        <MailCheckIcon />
        <AlertTitle>Check your inbox</AlertTitle>
        <AlertDescription>
          If {email} may sign in, a link is on its way. It expires in 15 minutes.
          <Button variant="link" size="sm" className="px-0" onClick={() => setSent(false)}>
            Use a different address
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The server reads redirect_to from the query string and puts it in the emailed link.
      const path = `/api/auth/magic/request?redirect_to=${encodeURIComponent(redirectTo)}`;
      await apiSend('POST', path, { email });
      setSent(true);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 429
          ? 'Too many sign-in links requested. Wait a few minutes and try again.'
          : 'Could not send the sign-in link. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-2" onSubmit={(event) => void submit(event)}>
      <Label htmlFor="magic-email">Email</Label>
      <Input
        id="magic-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="submit" variant="outline" className="w-full" disabled={busy}>
        {busy ? 'Sending…' : 'Email me a sign-in link'}
      </Button>
    </form>
  );
}

function DevLoginForm({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [email, setEmail] = useState('admin@local.test');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend('POST', '/api/auth/dev', { email });
      await onSignedIn();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 404
          ? 'Development login is disabled on this server.'
          : 'Could not sign in. Please try again.',
      );
      setBusy(false);
    }
  };

  return (
    <form className="space-y-2" onSubmit={(event) => void submit(event)}>
      <div className="border-muted-foreground/30 space-y-2 rounded-lg border border-dashed p-3">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Development only
        </p>
        <Label htmlFor="dev-email">Sign in as</Label>
        <Input
          id="dev-email"
          name="devEmail"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button type="submit" variant="secondary" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Dev sign in'}
        </Button>
      </div>
    </form>
  );
}
