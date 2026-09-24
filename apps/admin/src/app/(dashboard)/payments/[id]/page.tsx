import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Forbidden } from '@/components/dashboard/forbidden';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';
import { BOOKING_STATUS_LABEL, bookingRef } from '@/lib/bookings';
import { dateTime } from '@/lib/documents';
import { adminFor } from '@/lib/guard';
import { rupees } from '@/lib/listings';
import {
  LEDGER_ACCOUNT_LABEL,
  PAYMENT_STATUS_LABEL,
  REFUND_KIND_LABEL,
  REFUND_STATUS_LABEL,
  TRANSFER_STATUS_LABEL,
} from '@/lib/payments';
import { MODERATORS } from '@/lib/roles';
import { RetryButton } from '../retry-button';
import { RefundForm } from './refund-form';

export const metadata: Metadata = { title: 'Payment' };

export default async function PaymentPage({ params }: PageProps<'/payments/[id]'>) {
  const me = await adminFor('/payments');
  if (!me) return <Forbidden />;
  const { id } = await params;
  const p = await unwrap(
    (await adminApi()).GET('/v1/admin/payments/{id}', { params: { path: { id } } }),
  ).catch((err: unknown) => {
    if (err instanceof ApiRequestError && err.error.code === 'NOT_FOUND') notFound();
    throw err;
  });
  const moderator = MODERATORS.includes(me.role);
  const paid = ['CAPTURED', 'PARTIALLY_REFUNDED'].includes(p.status);

  const line = (label: string, value: string, strong = false) => (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-semibold' : undefined}>{value}</span>
    </div>
  );

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/payments" className="text-muted-foreground hover:underline">
          ← Payments
        </Link>
      </p>
      <PageHeader
        title={`Payment for ${bookingRef(p.bookingId)}: ${p.listingTitle}`}
        description={`${p.borrowerName ?? 'Borrower'} · ${dateTime.format(
          new Date(p.capturedAt ?? p.createdAt),
        )}${p.provider === 'fake' ? ' · test payment (fake provider)' : ''}`}
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Refunds</CardTitle>
            </CardHeader>
            <CardContent>
              {p.refunds.length === 0 ? (
                <p className="text-sm text-muted-foreground">No refunds.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p.refunds.map((r) => (
                      <TableRow key={r.id} data-testid="refund-row">
                        <TableCell className="whitespace-nowrap">
                          {dateTime.format(new Date(r.createdAt))}
                        </TableCell>
                        <TableCell>
                          {REFUND_KIND_LABEL[r.kind] ?? r.kind}
                          {r.reason && (
                            <p className="text-xs text-muted-foreground">
                              “{r.reason}”{r.adminName && ` · ${r.adminName}`}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>{rupees(r.amountPaise)}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'FAILED' ? 'destructive' : 'secondary'}>
                            {REFUND_STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                          {r.failureReason && (
                            <p className="text-xs text-destructive">{r.failureReason}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payouts to the lender</CardTitle>
            </CardHeader>
            <CardContent>
              {p.transfers.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lender</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="sr-only">Retry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p.transfers.map((t) => (
                      <TableRow key={t.id} data-testid="transfer-row">
                        <TableCell>{t.lenderName ?? '—'}</TableCell>
                        <TableCell>{rupees(t.amountPaise)}</TableCell>
                        <TableCell>
                          <Badge variant={t.status === 'FAILED' ? 'destructive' : 'secondary'}>
                            {TRANSFER_STATUS_LABEL[t.status]}
                          </Badge>
                          {!t.onHold && t.status === 'RELEASED' && (
                            <p className="text-xs text-muted-foreground">
                              Kept share, paid at once
                            </p>
                          )}
                          {t.failureReason && (
                            <p className="text-xs text-destructive">{t.failureReason}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {t.status === 'FAILED' && moderator && <RetryButton id={t.id} />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ledger lines for this booking</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.ledger.map((l, i) => (
                    <TableRow key={i} data-testid="ledger-line">
                      <TableCell className="whitespace-nowrap">
                        {dateTime.format(new Date(l.createdAt))}
                      </TableCell>
                      <TableCell className="text-xs">{l.type}</TableCell>
                      <TableCell>{LEDGER_ACCOUNT_LABEL[l.account]}</TableCell>
                      <TableCell className="text-right">
                        {l.debitPaise ? rupees(l.debitPaise) : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        {l.creditPaise ? rupees(l.creditPaise) : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                  {p.ledger.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No ledger lines yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                Payment
                <Badge data-testid="payment-status">{PAYMENT_STATUS_LABEL[p.status]}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {line('Rent', rupees(p.rentPaise))}
              {p.feePaise > 0 && line('Service fee', rupees(p.feePaise))}
              {line('Deposit', rupees(p.depositPaise))}
              {line('Charged', rupees(p.amountPaise), true)}
              {line('Refunded', rupees(p.refundedPaise))}
              <div data-testid="refundable">
                {line('Left to refund', rupees(p.refundablePaise))}
              </div>
              <div className="mt-2 grid gap-1 border-t pt-2 text-xs text-muted-foreground">
                <p>Method: {p.method ?? '—'}</p>
                <p className="break-all">Order: {p.orderId}</p>
                <p className="break-all">Payment: {p.paymentId ?? '—'}</p>
                {p.failureReason && <p className="text-destructive">{p.failureReason}</p>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Booking</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p>
                {bookingRef(p.bookingId)} ·{' '}
                {BOOKING_STATUS_LABEL[p.bookingStatus] ?? p.bookingStatus}
              </p>
              <Link href={`/bookings/${p.bookingId}`} className="text-primary hover:underline">
                Open booking →
              </Link>
            </CardContent>
          </Card>
          {paid &&
            p.refundablePaise > 0 &&
            (moderator ? (
              <RefundForm id={p.id} refundablePaise={p.refundablePaise} />
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="cannot-refund">
                Only Ops and Super Admins can refund payments.
              </p>
            ))}
        </div>
      </div>
    </>
  );
}
