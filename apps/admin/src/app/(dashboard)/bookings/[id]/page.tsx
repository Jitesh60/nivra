import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Forbidden } from '@/components/dashboard/forbidden';
import { ConditionPhotos } from '@/components/dashboard/condition-photos';
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
import {
  BOOKING_EVENT_LABEL,
  BOOKING_STATUS_LABEL,
  bookingDates,
  bookingRef,
  PARTY_LABEL,
  REQUIRED_DOC_LABEL,
} from '@/lib/bookings';
import { DOCUMENT_TYPE_LABEL, dateTime } from '@/lib/documents';
import { adminFor } from '@/lib/guard';
import { rupees } from '@/lib/listings';
import { MODERATORS } from '@/lib/roles';
import { CancelForm } from './cancel-form';

export const metadata: Metadata = { title: 'Booking' };

export default async function BookingPage({ params }: PageProps<'/bookings/[id]'>) {
  const me = await adminFor('/bookings');
  if (!me) return <Forbidden />;
  const { id } = await params;
  const b = await unwrap(
    (await adminApi()).GET('/v1/admin/bookings/{id}', { params: { path: { id } } }),
  ).catch((err: unknown) => {
    if (err instanceof ApiRequestError && err.error.code === 'NOT_FOUND') notFound();
    throw err;
  });

  const line = (label: string, value: string, strong = false) => (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-semibold' : undefined}>{value}</span>
    </div>
  );

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/bookings" className="text-muted-foreground hover:underline">
          ← Bookings
        </Link>
      </p>
      <PageHeader
        title={`Booking ${bookingRef(b.id)}: ${b.listing.title}`}
        description={`${bookingDates(b)} · ${b.days} ${b.days === 1 ? 'day' : 'days'} · ${
          b.source === 'OFFER' ? 'agreed in chat' : 'requested at the listed price'
        }`}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">People</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p>
                Borrower:{' '}
                <Link href={`/users/${b.borrower.id}`} className="font-medium hover:underline">
                  {b.borrower.name ?? 'Unnamed user'}
                </Link>{' '}
                <span className="text-muted-foreground">{b.borrower.phone}</span>
              </p>
              <p>
                Lender:{' '}
                <Link href={`/users/${b.lender.id}`} className="font-medium hover:underline">
                  {b.lender.name ?? 'Unnamed user'}
                </Link>{' '}
                <span className="text-muted-foreground">{b.lender.phone}</span>{' '}
                <span data-testid="lender-cancellations" className="text-muted-foreground">
                  · {b.lenderCancellations} cancellation{b.lenderCancellations === 1 ? '' : 's'}{' '}
                  after accepting
                </span>
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href={`/listings/${b.listing.id}`} className="text-primary hover:underline">
                  Open listing →
                </Link>
                <Link
                  href={`/conversations/${b.conversationId}?booking=${b.id}`}
                  className="text-primary hover:underline"
                >
                  View conversation (logged) →
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>What</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {b.events.map((e, i) => (
                    <TableRow key={i} data-testid="booking-event">
                      <TableCell className="whitespace-nowrap">
                        {dateTime.format(new Date(e.at))}
                      </TableCell>
                      <TableCell>
                        {BOOKING_EVENT_LABEL[e.type] ?? e.type}
                        <span className="block text-xs text-muted-foreground">
                          → {BOOKING_STATUS_LABEL[e.status] ?? e.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {e.actorName ?? PARTY_LABEL[e.by]}
                        {e.actorName && (
                          <span className="block text-xs text-muted-foreground">
                            {PARTY_LABEL[e.by]}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-pre-line">{e.note ?? ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {b.conditionReports.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Condition photos</CardTitle>
              </CardHeader>
              <CardContent>
                <ConditionPhotos reports={b.conditionReports} base={`/bookings/${b.id}/photos`} />
              </CardContent>
            </Card>
          )}

          {b.requiredDocs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Documents</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <p className="text-muted-foreground">
                  Lender asks for:{' '}
                  {b.requiredDocs
                    .map((d) => d.note ?? REQUIRED_DOC_LABEL[d.docType] ?? d.docType)
                    .join(', ')}
                  . Images aren’t shown here; review IDs in Documents.
                </p>
                {b.sharedDocuments.length === 0 ? (
                  <p>Nothing shared yet.</p>
                ) : (
                  b.sharedDocuments.map((s) => (
                    <div key={s.id} className="rounded-md border p-3" data-testid="shared-document">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {s.label ??
                          DOCUMENT_TYPE_LABEL[s.docType as keyof typeof DOCUMENT_TYPE_LABEL]}
                        <Badge variant="secondary">{s.status}</Badge>
                        {s.verified && <Badge variant="outline">Verified by Nivra</Badge>}
                        {s.purgedAt && <Badge variant="outline">Deleted</Badge>}
                      </p>
                      {s.views.length === 0 ? (
                        <p className="text-muted-foreground">Not opened.</p>
                      ) : (
                        <ul className="mt-1 text-muted-foreground">
                          {s.views.map((v, i) => (
                            <li key={i} data-testid="document-view">
                              Opened by {v.viewerName ?? 'unknown'} ·{' '}
                              {dateTime.format(new Date(v.at))}
                              {v.ip ? ` · ${v.ip}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                      {s.accessExpiresAt && (
                        <p className="text-xs text-muted-foreground">
                          Access ended {dateTime.format(new Date(s.accessExpiresAt))}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                Status
                <Badge data-testid="booking-status">
                  {BOOKING_STATUS_LABEL[b.status] ?? b.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {b.expiresAt && <p>Times out {dateTime.format(new Date(b.expiresAt))}</p>}
              {b.declineReason && <p>Declined: “{b.declineReason}”</p>}
              {b.cancelledBy && (
                <p>
                  Cancelled by {PARTY_LABEL[b.cancelledBy]}
                  {b.cancelReason ? `: “${b.cancelReason}”` : ''}
                </p>
              )}
              {b.closedAt && <p>Closed {dateTime.format(new Date(b.closedAt))}</p>}
            </CardContent>
          </Card>
          {b.rental && (
            <Card data-testid="rental-card">
              <CardHeader>
                <CardTitle className="text-base">Rental</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {b.rental.noShowAt ? (
                  <p>Borrower didn’t show up ({dateTime.format(new Date(b.rental.noShowAt))})</p>
                ) : (
                  <>
                    {line(
                      'Handed over',
                      b.rental.handedOverAt
                        ? dateTime.format(new Date(b.rental.handedOverAt))
                        : 'Not yet',
                    )}
                    {line('Due back by', dateTime.format(new Date(b.rental.dueAt)))}
                    {line(
                      'Returned',
                      b.rental.returnedAt
                        ? dateTime.format(new Date(b.rental.returnedAt))
                        : b.rental.handedOverAt
                          ? 'Not yet'
                          : '—',
                    )}
                    {b.rental.lateDays > 0 &&
                      line(
                        `Late fee (${b.rental.lateDays} ${b.rental.lateDays === 1 ? 'day' : 'days'})`,
                        rupees(b.rental.lateFeePaise),
                      )}
                    {b.rental.claimUntil &&
                      !b.rental.completedAt &&
                      line(
                        'Lender can report until',
                        dateTime.format(new Date(b.rental.claimUntil)),
                      )}
                    {b.rental.completedAt && (
                      <>
                        {line('Completed', dateTime.format(new Date(b.rental.completedAt)))}
                        {line('Deposit kept by lender', rupees(b.rental.keptPaise))}
                      </>
                    )}
                  </>
                )}
                {b.disputeId && (
                  <Link
                    href={`/disputes/${b.disputeId}`}
                    className="mt-1 text-xs text-primary hover:underline"
                    data-testid="booking-dispute"
                  >
                    Dispute →
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Money</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {line(
                `${rupees(b.pricePerDayPaise)} × ${b.days} ${b.days === 1 ? 'day' : 'days'}`,
                rupees(b.rentPaise),
              )}
              {line('Service fee', rupees(b.feePaise))}
              {line('Refundable deposit', rupees(b.depositPaise))}
              {line('Total', rupees(b.totalPaise), true)}
              <Link
                href={`/payments?q=${b.id}`}
                className="mt-1 text-xs text-primary hover:underline"
                data-testid="booking-payments"
              >
                Payments and refunds →
              </Link>
            </CardContent>
          </Card>
          {b.cancellable &&
            (MODERATORS.includes(me.role) ? (
              <CancelForm id={b.id} />
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="cannot-cancel">
                Only Ops and Super Admins can cancel bookings.
              </p>
            ))}
        </div>
      </div>
    </>
  );
}
