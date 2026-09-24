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
import { bookingRef } from '@/lib/bookings';
import { dateTime } from '@/lib/documents';
import { adminFor } from '@/lib/guard';
import { rupees } from '@/lib/listings';
import { PAYMENT_STATUS_LABEL, PAYMENT_TABS, type PaymentTab } from '@/lib/payments';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Payments' };

export default async function PaymentsPage({ searchParams }: PageProps<'/payments'>) {
  if (!(await adminFor('/payments'))) return <Forbidden />;
  const params = await searchParams;
  const tab = PAYMENT_TABS.includes(params.tab as PaymentTab) ? (params.tab as PaymentTab) : 'ALL';
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;
  const page = await unwrap(
    (await adminApi()).GET('/v1/admin/payments', {
      params: {
        query: {
          limit: 25,
          ...(tab === 'ALL' ? {} : { status: tab }),
          ...(q ? { q } : {}),
          ...(cursor ? { cursor } : {}),
        },
      },
    }),
  );
  const link = (extra: Record<string, string> = {}) =>
    `/payments?${new URLSearchParams({ tab, ...(q ? { q } : {}), ...extra })}`;

  return (
    <>
      <PageHeader
        title="Payments"
        description="What borrowers paid through Razorpay, and what went back to them. Newest first."
      />
      <nav aria-label="Payment status" className="mb-4 flex flex-wrap gap-2">
        {PAYMENT_TABS.map((t) => (
          <Link
            key={t}
            href={`/payments?tab=${t}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            aria-current={t === tab ? 'page' : undefined}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm',
              t === tab ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            {PAYMENT_STATUS_LABEL[t]}
          </Link>
        ))}
      </nav>
      <form className="mb-4 flex max-w-lg gap-2" role="search">
        <input type="hidden" name="tab" value={tab} />
        <Input
          name="q"
          defaultValue={q}
          placeholder="Listing, borrower (name or phone), order, payment or booking id"
          aria-label="Search payments"
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
              <TableHead>Borrower</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Refunded</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="sr-only">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {q ? `No payments match “${q}”.` : 'No payments here yet.'}
                </TableCell>
              </TableRow>
            )}
            {page.items.map((p) => (
              <TableRow key={p.id} data-testid="payment-row">
                <TableCell className="max-w-64">
                  <p className="truncate font-medium">{p.listingTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {bookingRef(p.bookingId)} ·{' '}
                    {dateTime.format(new Date(p.capturedAt ?? p.createdAt))}
                    {p.provider === 'fake' && ' · test'}
                  </p>
                </TableCell>
                <TableCell>{p.borrowerName ?? '—'}</TableCell>
                <TableCell>{rupees(p.amountPaise)}</TableCell>
                <TableCell>{p.refundedPaise > 0 ? rupees(p.refundedPaise) : '—'}</TableCell>
                <TableCell>
                  <Badge variant={p.status === 'FAILED' ? 'destructive' : 'secondary'}>
                    {PAYMENT_STATUS_LABEL[p.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/payments/${p.id}`}>Open</Link>
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
