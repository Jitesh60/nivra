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
import {
  DISPUTE_REASON_LABEL,
  DISPUTE_STATUS_LABEL,
  DISPUTE_TABS,
  type DisputeStatus,
} from '@/lib/disputes';
import { dateTime } from '@/lib/documents';
import { adminFor } from '@/lib/guard';
import { rupees } from '@/lib/listings';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Disputes' };

export default async function DisputesPage({ searchParams }: PageProps<'/disputes'>) {
  if (!(await adminFor('/disputes'))) return <Forbidden />;
  const params = await searchParams;
  const status = DISPUTE_TABS.includes(params.status as DisputeStatus)
    ? (params.status as DisputeStatus)
    : 'OPEN';
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;
  const page = await unwrap(
    (await adminApi()).GET('/v1/admin/disputes', {
      params: { query: { status, limit: 25, ...(cursor ? { cursor } : {}) } },
    }),
  );

  return (
    <>
      <PageHeader
        title="Disputes"
        description="Problems lenders reported after a rental. Decide how much of the deposit the lender keeps; the rest goes back to the borrower."
      />
      <nav aria-label="Dispute status" className="mb-4 flex flex-wrap gap-2">
        {DISPUTE_TABS.map((s) => (
          <Link
            key={s}
            href={`/disputes?status=${s}`}
            aria-current={s === status ? 'page' : undefined}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm',
              s === status ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            {DISPUTE_STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking</TableHead>
              <TableHead>Problem</TableHead>
              <TableHead>People</TableHead>
              <TableHead className="text-right">Claim</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead className="sr-only">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {status === 'OPEN' ? 'No open disputes. 🎉' : 'No settled disputes.'}
                </TableCell>
              </TableRow>
            )}
            {page.items.map((d) => (
              <TableRow key={d.id} data-testid="dispute-row">
                <TableCell className="max-w-64">
                  <p className="truncate font-medium">{d.listingTitle}</p>
                  <p className="text-xs text-muted-foreground">{bookingRef(d.bookingId)}</p>
                </TableCell>
                <TableCell>
                  {DISPUTE_REASON_LABEL[d.reason]}
                  {status === 'OPEN' && (
                    <Badge variant={d.responded ? 'secondary' : 'outline'} className="ml-2">
                      {d.responded ? 'Borrower replied' : 'No reply yet'}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {d.lenderName ?? 'Lender'} → {d.borrowerName ?? 'Borrower'}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {rupees(d.claimPaise)}
                  <span className="block text-xs text-muted-foreground">
                    of {rupees(d.depositPaise)}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {dateTime.format(new Date(d.createdAt))}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant={status === 'OPEN' ? 'default' : 'outline'}>
                    <Link href={`/disputes/${d.id}`}>{status === 'OPEN' ? 'Review' : 'Open'}</Link>
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
              <Link href={`/disputes?status=${status}`}>First page</Link>
            </Button>
          )}
          {page.nextCursor && (
            <Button asChild variant="outline">
              <Link href={`/disputes?status=${status}&cursor=${page.nextCursor}`}>Next page</Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}
