import { connection } from 'next/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { API_URL, getApiHealth } from '@/lib/api';

// Phase 0 placeholder: confirms the admin app can reach the API.
// Replaced by the login screen in Phase 1c.
export default async function Home() {
  await connection();
  const health = await getApiHealth();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 p-6">
      <div>
        <p className="text-sm font-medium text-primary">Sajha</p>
        <h1 className="text-3xl font-semibold tracking-tight">Admin console</h1>
        <p className="mt-1 text-muted-foreground">
          Sign-in with two-factor authentication arrives in Phase 1c.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API status</CardTitle>
          <CardDescription className="font-mono">{API_URL}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {health.reachable ? (
            <>
              <Badge variant={health.status === 'ok' ? 'default' : 'destructive'}>
                API {health.status}
              </Badge>
              {Object.entries(health.checks).map(([name, state]) => (
                <Badge key={name} variant={state === 'up' ? 'secondary' : 'destructive'}>
                  {name}: {state}
                </Badge>
              ))}
            </>
          ) : (
            <Badge variant="destructive">API unreachable</Badge>
          )}
        </CardContent>
      </Card>

      <Button asChild variant="outline" className="self-start">
        <a href={`${API_URL}/docs`} target="_blank" rel="noreferrer">
          Open API docs
        </a>
      </Button>
    </main>
  );
}
