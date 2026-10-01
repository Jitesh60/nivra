import { Badge, Button } from '@sajha/ui';
import { ArrowLeft, Check, FileText, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/app/avatar';
import { ActionButton, ReasonAction } from '@/components/bookings/booking-actions';
import {
  EVENT_TEXT,
  getBooking,
  getCancelPreview,
  STATUS_TEXT,
  USER_DOC_LABEL,
  type Booking,
} from '@/lib/bookings';
import { DOC_LABEL, rupees, shortDate } from '@/lib/format';
import {
  acceptAction,
  approveDocsAction,
  cancelAction,
  declineAction,
  rejectDocsAction,
} from '../actions';

export const metadata: Metadata = { title: 'Booking' };

const NOTICES: Record<string, string> = {
  requested: 'Request sent. The lender usually replies within a day.',
  shared: 'Documents shared. The lender will check them.',
  paid: 'Payment received. Your booking is confirmed.',
};

export default async function BookingPage({ params, searchParams }: PageProps<'/bookings/[id]'>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const booking = await getBooking(id);
  if (!booking) notFound();
  const status = STATUS_TEXT[booking.status];
  const borrower = booking.role === 'BORROWER';
  const can = booking.can;
  const notice = Object.keys(NOTICES).find((k) => sp[k]);
  let refund: Awaited<ReturnType<typeof getCancelPreview>> | null = null;
  if (can.cancel && booking.payment) {
    refund = await getCancelPreview(id).catch(() => null);
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <Link
        href={`/bookings?role=${booking.role}`}
        className="flex items-center gap-1 text-small font-semibold text-sj-muted-foreground hover:text-sj-foreground"
      >
        <ArrowLeft className="size-4" /> Bookings
      </Link>
      {notice && (
        <p
          role="status"
          className="rounded-md bg-sj-primary-soft px-4 py-3 text-small text-sj-on-primary-soft"
        >
          {NOTICES[notice]}
        </p>
      )}

      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-sj-border bg-sj-surface p-4 shadow-xs">
        {booking.listing.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- public storage URL
          <img src={booking.listing.thumbUrl} alt="" className="size-20 rounded-md object-cover" />
        )}
        <div className="grid min-w-0 flex-1 gap-1">
          <Link
            href={`/item/${booking.listing.id}`}
            className="truncate font-display text-h3 hover:underline"
          >
            {booking.listing.title}
          </Link>
          <p className="text-small text-sj-muted-foreground">
            {shortDate(booking.startDate)} – {shortDate(booking.endDate)} · {booking.days}{' '}
            {booking.days === 1 ? 'day' : 'days'}
          </p>
          <p className="flex items-center gap-2 text-small">
            <Avatar name={booking.other.name} url={booking.other.avatarUrl} size={22} />
            {borrower ? 'Lender' : 'Borrower'}: {booking.other.name ?? 'Nivra user'}
            {booking.other.idVerified && <Badge tone="success">ID verified</Badge>}
          </p>
        </div>
        <Badge tone={status.tone} data-testid="booking-status">
          {status.label}
        </Badge>
      </section>

      <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
        <p className="text-body">{borrower ? status.borrower : status.lender}</p>
        {booking.declineReason && (
          <p className="text-small text-sj-muted-foreground">Reason: {booking.declineReason}</p>
        )}
        {booking.cancelReason && (
          <p className="text-small text-sj-muted-foreground">
            Cancelled by {booking.cancelledBy?.toLowerCase()}: {booking.cancelReason}
          </p>
        )}
        {booking.expiresAt &&
          ['REQUESTED', 'AWAITING_DOCS', 'AWAITING_PAYMENT'].includes(booking.status) && (
            <p className="text-caption text-sj-muted-foreground">
              Expires{' '}
              {new Date(booking.expiresAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          )}
        <div className="flex flex-wrap items-start gap-2">
          {can.accept && <ActionButton run={acceptAction.bind(null, id)}>Accept</ActionButton>}
          {can.decline && (
            <ReasonAction
              run={declineAction.bind(null, id)}
              label="Decline"
              prompt="Reason (optional, shown to the borrower)"
              submitLabel="Decline request"
              required={false}
            />
          )}
          {can.shareDocs && (
            <Button asChild>
              <Link href={`/bookings/${id}/share`}>Share documents</Link>
            </Button>
          )}
          {can.pay && (
            <Button asChild>
              <Link href={`/bookings/${id}/pay`}>Pay {rupees(booking.totalPaise)}</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/inbox/${booking.conversationId}`}>
              Message {borrower ? 'lender' : 'borrower'}
            </Link>
          </Button>
          {can.cancel && (
            <ReasonAction
              run={cancelAction.bind(null, id)}
              label="Cancel booking"
              prompt="Why are you cancelling?"
              submitLabel="Cancel booking"
              variant="ghost"
              intro={
                refund && (
                  <p className="text-small" data-testid="refund-preview">
                    {refund.summary} Refund: <strong>{rupees(refund.refundPaise)}</strong>.
                  </p>
                )
              }
            />
          )}
        </div>
      </section>

      {booking.pickupAddress && (
        <section className="flex gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
          <MapPin className="mt-0.5 size-5 text-sj-primary" />
          <div>
            <h2 className="font-semibold">Pickup address</h2>
            <p className="text-small">{booking.pickupAddress}</p>
          </div>
        </section>
      )}

      <Documents booking={booking} />
      <Price booking={booking} />

      <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
        <h2 className="text-h3">Timeline</h2>
        <ol className="grid gap-2">
          {booking.events.map((e, i) => (
            <li key={`${e.type}-${i}`} className="flex gap-3 text-small">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-sj-primary-soft text-sj-on-primary-soft">
                <Check className="size-3" />
              </span>
              <span>
                <span className="font-semibold">{EVENT_TEXT[e.type] ?? e.type}</span>
                <span className="text-sj-muted-foreground">
                  {' '}
                  ·{' '}
                  {new Date(e.at).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
                {e.note && <span className="block text-sj-muted-foreground">{e.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Price({ booking }: { booking: Booking }) {
  const borrower = booking.role === 'BORROWER';
  const rows: [string, number][] = [
    [
      `${rupees(booking.pricePerDayPaise)} × ${booking.days} ${booking.days === 1 ? 'day' : 'days'}`,
      booking.rentPaise,
    ],
  ];
  if (borrower) {
    rows.push(['Service fee', booking.feePaise]);
    if (booking.creditPaise) rows.push(['Credit', -booking.creditPaise]);
    rows.push(['Refundable deposit', booking.depositPaise]);
  }
  return (
    <section className="grid gap-2 rounded-lg border border-sj-border bg-sj-surface p-5 text-small">
      <h2 className="text-h3">{borrower ? 'What you pay' : 'Rent'}</h2>
      {rows.map(([label, value]) => (
        <p key={label} className="flex justify-between">
          <span className="text-sj-muted-foreground">{label}</span>
          <span>{value < 0 ? `−${rupees(-value)}` : rupees(value)}</span>
        </p>
      ))}
      {borrower && (
        <p className="flex justify-between border-t border-sj-border pt-2 font-bold">
          <span>Total</span>
          <span>{rupees(booking.totalPaise)}</span>
        </p>
      )}
      {booking.payment && (
        <p className="text-caption text-sj-muted-foreground">
          Payment {booking.payment.status.toLowerCase().replace('_', ' ')}
          {booking.payment.refundedPaise > 0 &&
            ` · ${rupees(booking.payment.refundedPaise)} refunded`}
        </p>
      )}
    </section>
  );
}

function Documents({ booking }: { booking: Booking }) {
  if (!booking.requiredDocs.length && !booking.sharedDocuments.length) return null;
  const id = booking.id;
  return (
    <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
      <h2 className="text-h3">Documents</h2>
      <ul className="grid gap-1 text-small">
        {booking.requiredDocs.map((d) => (
          <li key={d.id} className="flex items-center gap-2">
            <FileText className="size-4 text-sj-muted-foreground" />
            {d.note ?? DOC_LABEL[d.docType]}
          </li>
        ))}
      </ul>
      {booking.sharedDocuments.length > 0 && (
        <ul className="grid gap-2">
          {booking.sharedDocuments.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sj-border px-3 py-2 text-small"
            >
              <span>
                {USER_DOC_LABEL[s.docType]}
                {s.verified && ' · checked by Nivra'}{' '}
                <Badge
                  tone={
                    s.status === 'APPROVED'
                      ? 'success'
                      : s.status === 'REJECTED'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {s.status === 'SUBMITTED'
                    ? 'Shared'
                    : s.status === 'APPROVED'
                      ? 'Approved'
                      : 'Rejected'}
                </Badge>
              </span>
              {booking.role === 'LENDER' && s.viewable && (
                <Link
                  href={`/bookings/${id}/documents/${s.id}`}
                  className="font-semibold text-sj-primary underline-offset-4 hover:underline"
                >
                  View
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {booking.can.reviewDocs && (
        <div className="flex flex-wrap items-start gap-2">
          <ActionButton run={approveDocsAction.bind(null, id)}>Approve documents</ActionButton>
          <ReasonAction
            run={rejectDocsAction.bind(null, id)}
            label="Reject"
            prompt="What’s wrong? (shown to the borrower)"
            submitLabel="Reject documents"
          />
        </div>
      )}
    </section>
  );
}
