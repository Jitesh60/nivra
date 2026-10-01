import { Badge, Button, EmptyState, PageHeader } from '@sajha/ui';
import { Megaphone, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AreaControl } from '@/components/browse/area-control';
import { getMyRequests, getRequests, type ItemRequestCard } from '@/lib/growth';
import { rupees, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Requests' };

export default async function RequestsPage({ searchParams }: PageProps<'/requests'>) {
  const sp = await searchParams;
  const mine = sp.tab === 'mine';
  const lat = Number(sp.lat);
  const lng = Number(sp.lng);
  const area = Number.isFinite(lat) && Number.isFinite(lng) && sp.lat && sp.lng;
  // The board is local: it needs an area ("Near me").
  const items: ItemRequestCard[] = mine
    ? await getMyRequests()
    : area
      ? (await getRequests({ lat, lng, radiusKm: Math.min(25, Math.max(1, Number(sp.r) || 5)) }))
          .items
      : [];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Requests"
        description="Can’t find it? Ask. Lenders nearby who have it will reply."
        actions={
          <Button asChild>
            <Link href="/requests/new">
              <Plus /> Ask for something
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex rounded-full bg-sj-surface-muted p-1" aria-label="Requests">
          {(
            [
              ['', 'Near you'],
              ['mine', 'Mine'],
            ] as const
          ).map(([tab, label]) => (
            <Link
              key={tab}
              href={tab ? '/requests?tab=mine' : '/requests'}
              aria-current={(tab === 'mine') === mine ? 'page' : undefined}
              className={cn(
                'rounded-full px-4 py-1.5 text-small font-semibold',
                (tab === 'mine') === mine ? 'bg-sj-surface shadow-xs' : 'text-sj-muted-foreground',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        {!mine && <AreaControl />}
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title={
            mine
              ? 'You haven’t asked for anything'
              : area
                ? 'No requests here yet'
                : 'Turn on “Near me” to see requests around you'
          }
          description="Post what you need, and lenders who have it can reply with their listing."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/requests/${r.id}`}
                className="grid h-full gap-1 rounded-lg border border-sj-border bg-sj-surface p-4 shadow-xs hover:shadow-md"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{r.title}</span>
                  {r.status !== 'OPEN' && (
                    <Badge tone="neutral">{r.status === 'CLOSED' ? 'Closed' : 'Expired'}</Badge>
                  )}
                </span>
                <span className="line-clamp-2 text-small text-sj-muted-foreground">
                  {r.details}
                </span>
                <span className="text-caption text-sj-muted-foreground">
                  {r.areaLabel}
                  {r.distanceKm != null && ` · ${r.distanceKm.toFixed(1)} km`}
                  {r.startDate &&
                    ` · ${shortDate(r.startDate)}${r.endDate ? `–${shortDate(r.endDate)}` : ''}`}
                  {r.budgetPerDayPaise != null && ` · up to ${rupees(r.budgetPerDayPaise)}/day`}
                  {` · ${r.responseCount} ${r.responseCount === 1 ? 'reply' : 'replies'}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
