import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { API_URL, getApiHealth, getMe } from '@/lib/api';
import { canSee, NAV } from '@/lib/roles';

export const metadata: Metadata = { title: 'Overview' };

const DESCRIPTIONS: Record<string, string> = {
  '/users': 'Search app users and see their verification status.',
  '/waitlist': 'People waiting for launch, with CSV export.',
  '/admins': 'Invite admins, change roles, disable accounts.',
  '/account': 'Password and signed-in sessions.',
};

export default async function OverviewPage() {
  const [me, health] = await Promise.all([getMe(), getApiHealth()]);
  const cards = NAV.filter((i) => i.href !== '/' && canSee(i, me.role));

  return (
    <>
      <PageHeader
        title={`Welcome, ${me.name.split(' ')[0]}`}
        description="Sajha operations console."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((item) => (
          <Link key={item.href} href={item.href} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{DESCRIPTIONS[item.href]}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="mt-6">
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
    </>
  );
}
