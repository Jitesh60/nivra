import type { Metadata } from 'next';
import Link from 'next/link';
import { Forbidden } from '@/components/dashboard/forbidden';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { TRANSFER_STATUS_LABEL, TRANSFER_TABS, type TransferStatus } from '@/lib/payments';
import { MODERATORS } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { RetryButton } from '../retry-button';

export const metadata: Metadata = { title: 'Payouts' };

const HINT: Record<TransferStatus, string> = {
  FAILED: 'Razorpay refused the transfer. The sweep retries a few times; retry here once fixed.',
  AWAITING_ACCOUNT: 'The lender hasn’t finished payout setup. Sent once their account is active.',
  ON_HOLD: 'At Razorpay, held until the item is back (released in Phase 8).',
  RELEASED: 'Paid out to the lender’s bank.',
  REVERSED: 'Taken back after a cancellation.',
};

export default async function PayoutsPage({ searchParams }: PageProps<'/payments/payouts'>) {
  const me = await adminFor('/payments');
  if (!me) return <Forbidden />;
  const params = await searchParams;
  const status = TRANSFER_TABS.includes(params.status as TransferStatus)
    ? (params.status as TransferStatus)
    : 'FAILED';
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;
  const page = await unwrap(
    (await adminApi()).GET('/v1/admin/payouts', {
      params: { query: { status, limit: 25, ...(cursor ? { cursor } : {}) } },
    }),
  );
  const moderator = MODERATORS.includes(me.role);

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Transfers of each booking’s rent, less commission, to the lender (Razorpay Route)."
      />
      <nav aria-label="Payout status" className="mb-2 flex flex-wrap gap-2">
        {TRANSFER_TABS.map((s) => (
          <Link
            key={s}
            href={`/payments/payouts?status=${s}`}
            aria-current={s === status ? 'page' : undefined}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm',
              s === status ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            {TRANSFER_STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>
      <p className="mb-4 text-sm text-muted-foreground">{HINT[status]}</p>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking</TableHead>
              <TableHead>Lender</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nothing {TRANSFER_STATUS_LABEL[status].toLowerCase()}.
                </TableCell>
              </TableRow>
            )}
            {page.items.map((t) => (
              <TableRow key={t.id} data-testid="payout-row">
                <TableCell className="max-w-64">
                  <Link href={`/bookings/${t.bookingId}`} className="font-medium hover:underline">
                    {t.listingTitle}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {bookingRef(t.bookingId)} · {dateTime.format(new Date(t.createdAt))}
                    {t.attempts > 0 && ` · ${t.attempts} attempts`}
                  </p>
                </TableCell>
                <TableCell>{t.lenderName ?? '—'}</TableCell>
                <TableCell>{rupees(t.amountPaise)}</TableCell>
                <TableCell>
                  <Badge variant={t.status === 'FAILED' ? 'destructive' : 'secondary'}>
                    {TRANSFER_STATUS_LABEL[t.status]}
                  </Badge>
                  {t.failureReason && (
                    <p className="max-w-56 text-xs text-destructive">{t.failureReason}</p>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {t.status === 'FAILED' && moderator && <RetryButton id={t.id} />}
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
              <Link href={`/payments/payouts?status=${status}`}>First page</Link>
            </Button>
          )}
          {page.nextCursor && (
            <Button asChild variant="outline">
              <Link href={`/payments/payouts?status=${status}&cursor=${page.nextCursor}`}>
                Next page
              </Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}
