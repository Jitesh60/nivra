import { Badge, Button, PageHeader } from '@sajha/ui';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/app/avatar';
import { ActionButton } from '@/components/bookings/booking-actions';
import { ListingCard } from '@/components/browse/listing-card';
import { RespondForm } from '@/components/growth/respond-form';
import { rupees, shortDate } from '@/lib/format';
import { getRequest } from '@/lib/growth';
import { getMyListings } from '@/lib/listings';
import { closeRequestAction, respondToRequestAction } from '../../growth-actions';

export const metadata: Metadata = { title: 'Request' };

export default async function RequestPage({ params, searchParams }: PageProps<'/requests/[id]'>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const request = await getRequest(id);
  if (!request) notFound();
  const canRespond = !request.mine && request.status === 'OPEN' && !request.answeredByMe;
  const listings = canRespond ? (await getMyListings()).filter((l) => l.status === 'LIVE') : [];

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <Link
        href="/requests"
        className="flex items-center gap-1 text-small font-semibold text-sj-muted-foreground hover:text-sj-foreground"
      >
        <ArrowLeft className="size-4" /> Requests
      </Link>
      {sp.posted && (
        <p
          role="status"
          className="rounded-md bg-sj-primary-soft px-4 py-3 text-small text-sj-on-primary-soft"
        >
          Posted. Lenders nearby will see it.
        </p>
      )}
      <PageHeader
        title={request.title}
        description={`${request.areaLabel} · asked by ${request.borrower.name ?? 'a Nivra user'} on ${shortDate(request.createdAt)}`}
        actions={
          request.status !== 'OPEN' && (
            <Badge tone="neutral">{request.status === 'CLOSED' ? 'Closed' : 'Expired'}</Badge>
          )
        }
      />
      <section className="grid gap-2 rounded-lg border border-sj-border bg-sj-surface p-5">
        <p className="whitespace-pre-line">{request.details}</p>
        <p className="text-small text-sj-muted-foreground">
          {request.category && `${(request.category as { name: string }).name} · `}
          {request.startDate &&
            `${shortDate(request.startDate)}${request.endDate ? `–${shortDate(request.endDate)}` : ''} · `}
          {request.budgetPerDayPaise != null && `up to ${rupees(request.budgetPerDayPaise)}/day · `}
          open until {shortDate(request.expiresAt)}
        </p>
        {request.mine && request.status === 'OPEN' && (
          <div>
            <ActionButton run={closeRequestAction.bind(null, id)} variant="outline">
              Close request
            </ActionButton>
          </div>
        )}
      </section>

      {canRespond && (
        <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
          <h2 className="text-h3">Have one? Reply with your listing</h2>
          {listings.length ? (
            <RespondForm
              listings={listings.map((l) => ({ id: l.id, title: l.title }))}
              submit={respondToRequestAction.bind(null, id)}
            />
          ) : (
            <p className="text-small text-sj-muted-foreground">
              You need a live listing to reply.{' '}
              <Link
                href="/listings/new"
                className="font-semibold text-sj-primary underline-offset-4 hover:underline"
              >
                List it now
              </Link>
            </p>
          )}
        </section>
      )}
      {request.answeredByMe && !request.mine && (
        <p className="text-small text-sj-muted-foreground">You replied to this request.</p>
      )}

      {request.mine && (
        <section className="grid gap-3">
          <h2 className="text-h3">Replies ({request.responses.length})</h2>
          {request.responses.length === 0 ? (
            <p className="text-small text-sj-muted-foreground">No replies yet. We’ll notify you.</p>
          ) : (
            request.responses.map((r) => (
              <div
                key={r.id}
                className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-4 sm:grid-cols-[180px_1fr]"
              >
                {r.listing ? (
                  <ListingCard listing={r.listing as never} />
                ) : (
                  <p className="text-small">Listing no longer live.</p>
                )}
                <div className="grid content-start gap-2">
                  <p className="flex items-center gap-2 text-small font-semibold">
                    <Avatar name={r.lender.name} url={r.lender.avatarUrl} size={24} />{' '}
                    {r.lender.name ?? 'Nivra lender'}
                  </p>
                  <p className="text-small">{r.message}</p>
                  <div>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/inbox/${r.conversationId}`}>Chat</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}
