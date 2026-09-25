import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConditionPhotos } from '@/components/dashboard/condition-photos';
import { Forbidden } from '@/components/dashboard/forbidden';
import { PageHeader } from '@/components/dashboard/page-header';
import { PhotoThumbs } from '@/components/dashboard/photo-thumbs';
import { TranscriptList } from '@/components/dashboard/transcript';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';
import {
  BOOKING_EVENT_LABEL,
  BOOKING_STATUS_LABEL,
  bookingDates,
  bookingRef,
  PARTY_LABEL,
} from '@/lib/bookings';
import { DISPUTE_REASON_LABEL, DISPUTE_STATUS_LABEL, depositSplit } from '@/lib/disputes';
import { dateTime } from '@/lib/documents';
import { adminFor } from '@/lib/guard';
import { rupees } from '@/lib/listings';
import { MODERATORS } from '@/lib/roles';
import { ResolveForm } from './resolve-form';

export const metadata: Metadata = { title: 'Dispute' };

/** How many recent chat messages the workspace shows (the full transcript is a link away). */
const CHAT_EXCERPT = 10;

export default async function DisputePage({ params }: PageProps<'/disputes/[id]'>) {
  const me = await adminFor('/disputes');
  if (!me) return <Forbidden />;
  const { id } = await params;
  const api = await adminApi();
  const d = await unwrap(api.GET('/v1/admin/disputes/{id}', { params: { path: { id } } })).catch(
    (err: unknown) => {
      if (err instanceof ApiRequestError && err.error.code === 'NOT_FOUND') notFound();
      throw err;
    },
  );
  const [b, chat] = await Promise.all([
    unwrap(api.GET('/v1/admin/bookings/{id}', { params: { path: { id: d.bookingId } } })),
    unwrap(
      api.GET('/v1/admin/conversations/{id}/messages', {
        params: { path: { id: d.conversationId }, query: { limit: CHAT_EXCERPT } },
      }),
    ),
  ]);

  const base = `/disputes/${d.id}/photos`;
  const conditionCount = d.conditionReports.reduce((n, r) => n + r.photos.length, 0);
  const open = d.status === 'OPEN';
  const r = d.rental;
  const settled = depositSplit(d.depositPaise, r.lateFeePaise, d.keptPaise ?? 0);
  const line = (label: string, value: string, testId?: string) => (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span data-testid={testId}>{value}</span>
    </div>
  );

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href={`/disputes?status=${d.status}`}
          className="text-muted-foreground hover:underline"
        >
          ← Disputes
        </Link>
      </p>
      <PageHeader
        title={`${DISPUTE_REASON_LABEL[d.reason]}: ${d.listingTitle}`}
        description={`Booking ${bookingRef(d.bookingId)} · ${bookingDates(b)} · reported ${dateTime.format(new Date(d.createdAt))}`}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                The claim · {b.lender.name ?? d.lenderName ?? 'Lender'} (lender)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p>
                {DISPUTE_REASON_LABEL[d.reason]}, asking to keep{' '}
                <strong data-testid="dispute-claim">{rupees(d.claimPaise)}</strong>
              </p>
              <p className="whitespace-pre-line" data-testid="dispute-description">
                “{d.description}”
              </p>
              <PhotoThumbs
                base={base}
                from={conditionCount}
                count={d.evidence.length}
                label="Claim photo"
                testId="evidence-photo"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                The reply · {b.borrower.name ?? d.borrowerName ?? 'Borrower'} (borrower)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {d.responseNote ? (
                <>
                  <p className="whitespace-pre-line" data-testid="dispute-response">
                    “{d.responseNote}”
                  </p>
                  {d.respondedAt && (
                    <p className="text-xs text-muted-foreground">
                      {dateTime.format(new Date(d.respondedAt))}
                    </p>
                  )}
                  <PhotoThumbs
                    base={base}
                    from={conditionCount + d.evidence.length}
                    count={d.responsePhotos.length}
                    label="Reply photo"
                    testId="response-photo"
                  />
                </>
              ) : (
                <p className="text-muted-foreground">The borrower hasn’t replied.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Condition photos</CardTitle>
            </CardHeader>
            <CardContent>
              <ConditionPhotos reports={d.conditionReports} base={base} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                Chat (latest {CHAT_EXCERPT})
                <Link
                  href={`/conversations/${d.conversationId}?dispute=${d.id}`}
                  className="text-sm font-normal text-primary hover:underline"
                >
                  Full conversation →
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3" data-testid="chat-excerpt">
              <p className="text-xs text-muted-foreground">
                This view is logged. Text shows exactly what people typed.
              </p>
              <TranscriptList t={chat} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-2 text-sm">
                {b.events.map((e, i) => (
                  <li key={i} data-testid="booking-event" className="flex flex-wrap gap-x-3">
                    <span className="w-36 text-muted-foreground">
                      {dateTime.format(new Date(e.at))}
                    </span>
                    <span className="font-medium">{BOOKING_EVENT_LABEL[e.type] ?? e.type}</span>
                    <span className="text-muted-foreground">
                      {e.actorName ?? PARTY_LABEL[e.by]}
                    </span>
                    {e.note && (
                      <span className="basis-full whitespace-pre-line text-muted-foreground">
                        {e.note}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                Status
                <Badge data-testid="dispute-status" variant={open ? 'default' : 'secondary'}>
                  {DISPUTE_STATUS_LABEL[d.status]}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p>
                Booking:{' '}
                <Link href={`/bookings/${d.bookingId}`} className="text-primary hover:underline">
                  {BOOKING_STATUS_LABEL[b.status] ?? b.status} →
                </Link>
              </p>
              {r.handedOverAt && <p>Handed over {dateTime.format(new Date(r.handedOverAt))}</p>}
              {r.returnedAt ? (
                <p>Returned {dateTime.format(new Date(r.returnedAt))}</p>
              ) : (
                <p className="text-destructive">
                  Not returned (due {dateTime.format(new Date(r.dueAt))})
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deposit</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {line('Deposit held', rupees(d.depositPaise))}
              {line(
                r.lateDays > 0
                  ? `Late fee (${r.lateDays} ${r.lateDays === 1 ? 'day' : 'days'})`
                  : 'Late fee',
                rupees(r.lateFeePaise),
                'late-fee',
              )}
              {line('Lender asks for', rupees(d.claimPaise))}
              {line('Most the lender can keep', rupees(d.maxKeepPaise), 'max-keep')}
            </CardContent>
          </Card>
          {open ? (
            MODERATORS.includes(me.role) ? (
              <ResolveForm
                id={d.id}
                depositPaise={d.depositPaise}
                lateFeePaise={r.lateFeePaise}
                claimPaise={d.claimPaise}
                maxKeepPaise={d.maxKeepPaise}
              />
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="cannot-resolve">
                Only Ops and Super Admins can settle disputes.
              </p>
            )
          ) : (
            <Card data-testid="dispute-outcome">
              <CardHeader>
                <CardTitle className="text-base">Decision</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {line('Lender kept', rupees(d.keptPaise ?? 0), 'outcome-kept')}
                {line('Lender got (with late fee)', rupees(settled.lenderPaise))}
                {line('Borrower got back', rupees(settled.borrowerPaise), 'outcome-returned')}
                {d.resolutionNote && (
                  <p className="mt-2 whitespace-pre-line">“{d.resolutionNote}”</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {d.resolvedByName ?? 'Nivra'}
                  {d.resolvedAt ? ` · ${dateTime.format(new Date(d.resolvedAt))}` : ''}
                </p>
                <Link
                  href={`/payments?q=${d.bookingId}`}
                  className="mt-1 text-xs text-primary hover:underline"
                >
                  Payments and refunds →
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
