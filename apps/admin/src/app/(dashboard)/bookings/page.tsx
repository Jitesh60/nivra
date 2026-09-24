import type { Metadata } from 'next';
import Link from 'next/link';
import { Forbidden } from '@/components/dashboard/forbidden';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminApi, unwrap } from '@/lib/api';
import {
  BOOKING_STATUS_LABEL,
  BOOKING_TAB_LABEL,
  BOOKING_TABS,
  bookingDates,
  bookingRef,
  type BookingTab,
} from '@/lib/bookings';
import { dateTime } from '@/lib/documents';
import { adminFor } from '@/lib/guard';
import { rupees } from '@/lib/listings';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Bookings' };

export default async function BookingsPage({ searchParams }: PageProps<'/bookings'>) {
  if (!(await adminFor('/bookings'))) return <Forbidden />;
  const params = await searchParams;
  const tab = BOOKING_TABS.includes(params.tab as BookingTab) ? (params.tab as BookingTab) : 'OPEN';
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;
  const page = await unwrap(
    (await adminApi()).GET('/v1/admin/bookings', {
      params: { query: { tab, limit: 25, ...(q ? { q } : {}), ...(cursor ? { cursor } : {}) } },
    }),
  );
  const link = (extra: Record<string, string> = {}) =>
    `/bookings?${new URLSearchParams({ tab, ...(q ? { q } : {}), ...extra })}`;

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Requests and bookings between borrowers and lenders, newest first."
      />
      <nav aria-label="Booking status" className="mb-4 flex flex-wrap gap-2">
        {BOOKING_TABS.map((t) => (
          <Link
            key={t}
            href={`/bookings?tab=${t}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            aria-current={t === tab ? 'page' : undefined}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm',
              t === tab ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            {BOOKING_TAB_LABEL[t]}
          </Link>
        ))}
      </nav>
      <form className="mb-4 flex max-w-md gap-2" role="search">
        <input type="hidden" name="tab" value={tab} />
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search listing, borrower or lender (name or phone)"
          aria-label="Search bookings"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking</TableHead>
              <TableHead>Borrower → Lender</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="sr-only">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {q
                    ? `No bookings match “${q}”.`
                    : `No ${BOOKING_TAB_LABEL[tab].toLowerCase()} bookings.`}
                </TableCell>
              </TableRow>
            )}
            {page.items.map((b) => (
              <TableRow key={b.id} data-testid="booking-row">
                <TableCell className="max-w-64">
                  <p className="truncate font-medium">{b.listing.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {bookingRef(b.id)} · {dateTime.format(new Date(b.createdAt))}
                    {b.source === 'OFFER' && ' · from chat'}
                  </p>
                </TableCell>
                <TableCell>
                  {b.borrower.name ?? '—'} → {b.lender.name ?? '—'}
                </TableCell>
                <TableCell className="whitespace-nowrap">{bookingDates(b)}</TableCell>
                <TableCell>{rupees(b.totalPaise)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{BOOKING_STATUS_LABEL[b.status] ?? b.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/bookings/${b.id}`}>Open</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {(cursor || page.nextCursor) && (
        <div className="mt-4 flex gap-2">
          {cursor && (
            <Button asChild variant="outline">
              <Link href={link()}>First page</Link>
            </Button>
          )}
          {page.nextCursor && (
            <Button asChild variant="outline">
              <Link href={link({ cursor: page.nextCursor })}>Next page</Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}
