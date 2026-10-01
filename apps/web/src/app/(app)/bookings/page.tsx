import { Badge, Button, EmptyState, PageHeader } from '@sajha/ui';
import { CalendarCheck, ImageOff } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Avatar } from '@/components/app/avatar';
import { SlidingTabs } from '@/components/effects/sliding-tabs';
import { getBookings, STATUS_TEXT } from '@/lib/bookings';
import { rupees, shortDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Bookings' };

export default async function BookingsPage({ searchParams }: PageProps<'/bookings'>) {
  const sp = await searchParams;
  const role = sp.role === 'LENDER' ? 'LENDER' : 'BORROWER';
  const scope = sp.scope === 'PAST' ? 'PAST' : 'OPEN';
  const cursor = typeof sp.cursor === 'string' ? sp.cursor : undefined;
  const page = await getBookings(role, scope, cursor);
  const href = (r: string, s: string) => `/bookings?role=${r}&scope=${s}`;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Bookings"
        description="One account for both: what you’re borrowing and what you’re lending."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SlidingTabs
          id="bookings-side"
          label="Side"
          items={[
            { href: href('BORROWER', scope), label: 'Borrowing', active: role === 'BORROWER' },
            { href: href('LENDER', scope), label: 'Lending', active: role === 'LENDER' },
          ]}
        />
        <nav aria-label="When" className="flex gap-3 text-small font-semibold">
          {(
            [
              ['OPEN', 'Current'],
              ['PAST', 'Past'],
            ] as const
          ).map(([s, label]) => (
            <Link
              key={s}
              href={href(role, s)}
              aria-current={scope === s ? 'page' : undefined}
              className={
                scope === s
                  ? 'text-sj-foreground underline underline-offset-4'
                  : 'text-sj-muted-foreground'
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {page.items.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck />}
          title={scope === 'OPEN' ? 'No current bookings' : 'No past bookings'}
          description={
            role === 'BORROWER'
              ? 'Find something to rent and request your dates.'
              : 'Requests for your listings show up here.'
          }
          action={
            <Button asChild variant="secondary">
              <Link href={role === 'BORROWER' ? '/explore' : '/listings'}>
                {role === 'BORROWER' ? 'Explore items' : 'My listings'}
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {page.items.map((b, i) => {
            const status = STATUS_TEXT[b.status];
            return (
              <li key={b.id} className="rise-in" style={{ '--i': i } as React.CSSProperties}>
                <Link
                  href={`/bookings/${b.id}`}
                  className="flex items-center gap-4 rounded-lg border border-sj-border bg-sj-surface p-3 shadow-xs transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md bg-sj-surface-muted text-sj-muted-foreground">
                    {b.listing.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- public storage URL
                      <img src={b.listing.thumbUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <ImageOff className="size-5" />
                    )}
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate font-semibold">{b.listing.title}</span>
                    <span className="text-small text-sj-muted-foreground">
                      {shortDate(b.startDate)} – {shortDate(b.endDate)} · {rupees(b.totalPaise)}
                    </span>
                    <span className="flex items-center gap-2 text-caption text-sj-muted-foreground">
                      <Avatar name={b.other.name} url={b.other.avatarUrl} size={20} />
                      {b.other.name ?? 'Nivra user'}
                    </span>
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {page.nextCursor && (
        <div className="text-center">
          <Button asChild variant="outline">
            <Link href={`/bookings?role=${role}&scope=${scope}&cursor=${page.nextCursor}`}>
              Older
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
