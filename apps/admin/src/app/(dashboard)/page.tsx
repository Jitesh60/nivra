import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart } from '@/components/charts/bar-chart';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { change, dayLabel, type Metrics, PERIODS, periodFrom } from '@/lib/analytics';
import { adminApi, API_URL, getApiHealth, getMe, unwrap } from '@/lib/api';
import { rupees } from '@/lib/listings';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Overview' };

/** Whole rupees for tiles and chart labels ("₹12,300"). */
const money = (paise: number) => rupees(Math.round(paise / 100) * 100);

const KPIS: { key: keyof Metrics; label: string; money?: boolean }[] = [
  { key: 'signups', label: 'New accounts' },
  { key: 'listings', label: 'Listings published' },
  { key: 'confirmed', label: 'Bookings paid' },
  { key: 'gmvPaise', label: 'Money taken (GMV)', money: true },
  { key: 'revenuePaise', label: 'Sajha revenue', money: true },
  { key: 'disputesOpened', label: 'Disputes opened' },
];

export default async function OverviewPage({ searchParams }: PageProps<'/'>) {
  const days = periodFrom((await searchParams).days);
  const api = await adminApi();
  const [me, health, a, system] = await Promise.all([
    getMe(),
    getApiHealth(),
    unwrap(api.GET('/v1/admin/analytics', { params: { query: { days } } })),
    // Operations detail is a bonus: the dashboard still renders without it.
    unwrap(api.GET('/v1/admin/system')).catch(() => null),
  ]);
  const pct = (n: number) =>
    a.funnel.requested === 0 ? '—' : `${Math.round((n / a.funnel.requested) * 100)}%`;

  return (
    <>
      <PageHeader
        title={`Welcome, ${me.name.split(' ')[0]}`}
        description={`${dayLabel(a.from)} – ${dayLabel(a.to)} (India time), against the ${days} days before.`}
      />
      <nav aria-label="Period" className="mb-4 flex gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/?days=${p}`}
            aria-current={p === days ? 'page' : undefined}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm',
              p === days ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            {p} days
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {KPIS.map(({ key, label, money: isMoney }) => {
          const delta = change(a.totals[key], a.previous[key]);
          return (
            <Card key={key} data-testid={`kpi-${key}`}>
              <CardHeader className="pb-2">
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-2xl tabular-nums" data-testid="kpi-value">
                  {isMoney ? money(a.totals[key]) : a.totals[key].toLocaleString('en-IN')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <span
                  className={cn(
                    'font-medium',
                    delta.up === true && 'text-primary',
                    delta.up === false && 'text-destructive',
                  )}
                >
                  {delta.up === true ? '▲ ' : delta.up === false ? '▼ ' : ''}
                  {delta.text}
                </span>{' '}
                vs previous
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <BarChart
              title="Bookings paid per day"
              testId="chart-bookings"
              points={a.series.map((d) => ({ date: d.date, value: d.confirmed }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <BarChart
              title="Money taken per day"
              testId="chart-gmv"
              points={a.series.map((d) => ({ date: d.date, value: d.gmvPaise }))}
              format={money}
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card data-testid="funnel">
          <CardHeader>
            <CardTitle className="text-base">Bookings requested in the period</CardTitle>
            <CardDescription>How far they got.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {(
              [
                ['Requested', a.funnel.requested],
                ['Paid', a.funnel.confirmed],
                ['Completed', a.funnel.completed],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="grid gap-1">
                <div className="flex justify-between">
                  <span>{label}</span>
                  <span className="tabular-nums" data-testid={`funnel-${label.toLowerCase()}`}>
                    {n.toLocaleString('en-IN')}{' '}
                    <span className="text-muted-foreground">({pct(n)})</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-chart-1"
                    style={{
                      width: `${a.funnel.requested === 0 ? 0 : (n / a.funnel.requested) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card data-testid="right-now">
          <CardHeader>
            <CardTitle className="text-base">Right now</CardTitle>
            <CardDescription>
              Also in the period: {a.totals.cancelled.toLocaleString('en-IN')} cancelled,{' '}
              {money(a.totals.refundsPaise)} refunded, {a.totals.disputesSettled} disputes settled.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            {(
              [
                ['Active users', a.now.users, '/users'],
                ['Live listings', a.now.liveListings, '/listings?status=LIVE'],
                ['Items out on rent', a.now.activeRentals, '/bookings'],
                ['Open disputes', a.now.openDisputes, '/disputes'],
              ] as const
            ).map(([label, n, href]) => (
              <Link key={label} href={href} className="rounded-md border p-3 hover:bg-accent">
                <p className="text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold tabular-nums">{n.toLocaleString('en-IN')}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>API status</CardTitle>
          <CardDescription className="font-mono">{API_URL}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {health.reachable ? (
              <>
                <Badge variant={health.status === 'ok' ? 'default' : 'destructive'}>
                  API {health.status}
                </Badge>
                {Object.entries(health.checks).map(([name, state]) => (
                  <Badge key={name} variant={state === 'up' ? 'secondary' : 'destructive'}>
                    {name}: {state}
                    {system &&
                    (name === 'database' || name === 'redis') &&
                    system[name].latencyMs !== null
                      ? ` · ${system[name].latencyMs} ms`
                      : ''}
                  </Badge>
                ))}
                {system && (
                  <Badge variant="outline" data-testid="api-version">
                    version {system.version.slice(0, 7)}
                  </Badge>
                )}
              </>
            ) : (
              <Badge variant="destructive">API unreachable</Badge>
            )}
          </div>
          {system && (
            <table data-testid="queues" className="w-full max-w-2xl text-sm">
              <caption className="mb-2 text-left text-muted-foreground">
                Job queues. Waiting should drain within minutes; failed jobs are kept for a look.
              </caption>
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Queue</th>
                  <th className="py-1 text-right font-medium">Waiting</th>
                  <th className="py-1 text-right font-medium">Running</th>
                  <th className="py-1 text-right font-medium">Scheduled</th>
                  <th className="py-1 text-right font-medium">Failed</th>
                  <th className="py-1 text-right font-medium">Workers</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {system.queues.map((q) => (
                  <tr key={q.name} data-testid="queue-row" className="border-t">
                    <td className="py-1">{q.name}</td>
                    <td className="py-1 text-right">{q.waiting}</td>
                    <td className="py-1 text-right">{q.active}</td>
                    <td className="py-1 text-right">{q.delayed}</td>
                    <td
                      className={cn(
                        'py-1 text-right',
                        q.failed > 0 && 'font-semibold text-destructive',
                      )}
                    >
                      {q.failed}
                    </td>
                    <td className="py-1 text-right">{q.workers ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
