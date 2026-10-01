import { Badge, Button, Input } from '@sajha/ui';
import {
  BadgeCheck,
  CalendarDays,
  Compass,
  FileText,
  MapPin,
  PencilLine,
  ShieldCheck,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/app/avatar';
import { BorderBeam } from '@/components/effects/border-beam';
import { Gallery } from '@/components/browse/gallery';
import { RequestButton } from '@/components/browse/request-button';
import { StartChatButton } from '@/components/chat/start-chat-button';
import { SaveButton } from '@/components/browse/save-button';
import { Stars } from '@/components/browse/stars';
import { ApiRequestError, getMeOrNull } from '@/lib/api';
import { getListing, getQuote, getReviews, type PublicListing, type Quote } from '@/lib/discovery';
import { CONDITION_LABEL, DOC_LABEL, longDate, rupees, shortDate, todayIst } from '@/lib/format';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: PageProps<'/item/[id]'>): Promise<Metadata> {
  const listing = await getListing((await params).id);
  if (!listing) return { title: 'Item not found' };
  const price = rupees(listing.pricePerDayPaise);
  return {
    title: `Rent ${listing.title} for ${price}/day`,
    description: `${listing.title} for rent${listing.areaLabel ? ` in ${listing.areaLabel}` : ''} on Nivra: ${price} a day. ${listing.description.slice(0, 120)}`,
    openGraph: { images: listing.photos[0] ? [listing.photos[0].url] : undefined },
  };
}

const UNAVAILABLE: Record<string, (l: PublicListing) => string> = {
  BLOCKED: () => 'The lender isn’t free on some of these days.',
  TOO_SHORT: (l) => `The minimum rental is ${l.minDays} ${l.minDays === 1 ? 'day' : 'days'}.`,
  TOO_LONG: (l) => `The longest rental is ${l.maxDays} days.`,
  NOT_ENOUGH_NOTICE: (l) =>
    `Book at least ${l.advanceNoticeDays} ${l.advanceNoticeDays === 1 ? 'day' : 'days'} ahead.`,
};

export default async function ItemPage({ params, searchParams }: PageProps<'/item/[id]'>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const listing = await getListing(id);
  if (!listing) notFound();

  const start = typeof sp.start === 'string' && DATE.test(sp.start) ? sp.start : undefined;
  const end = typeof sp.end === 'string' && DATE.test(sp.end) ? sp.end : undefined;
  let quote: Quote | null = null;
  let quoteError: string | undefined;
  if (start && end) {
    try {
      quote = await getQuote(id, start, end);
    } catch (e) {
      if (!(e instanceof ApiRequestError)) throw e;
      quoteError = e.message;
    }
  }
  const [reviews, me] = await Promise.all([getReviews(id), getMeOrNull()]);
  const lender = listing.lender;
  const signedIn = me != null;
  // Everyone can borrow, lenders included: only your own items can't be booked.
  const mine = me?.id === lender.id;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid min-w-0 gap-6">
        <Gallery photos={listing.photos} title={listing.title} />
        <section className="grid gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-caption font-semibold tracking-wide text-sj-primary uppercase">
                {listing.category.name}
              </p>
              <h1 className="font-display text-h1 break-words">{listing.title}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-sj-muted-foreground">
                {listing.areaLabel && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-4" /> {listing.areaLabel}
                  </span>
                )}
                {listing.ratingAvg != null && listing.ratingCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Stars rating={listing.ratingAvg} size={14} /> {listing.ratingAvg.toFixed(1)} (
                    {listing.ratingCount})
                  </span>
                )}
              </p>
            </div>
            {!mine && (
              <SaveButton listingId={listing.id} saved={listing.saved} title={listing.title} />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{CONDITION_LABEL[listing.condition]}</Badge>
            {listing.brand && <Badge tone="neutral">{listing.brand}</Badge>}
            {listing.size && <Badge tone="neutral">Size {listing.size}</Badge>}
            {listing.weeklyDiscountPct > 0 && (
              <Badge tone="accent">{listing.weeklyDiscountPct}% off for 7+ days</Badge>
            )}
          </div>
          <p className="text-body whitespace-pre-line">{listing.description}</p>
        </section>

        <section className="grid gap-2 rounded-lg border border-sj-border bg-sj-surface p-5">
          <h2 className="text-h3">Rental terms</h2>
          <ul className="grid gap-1.5 text-small">
            <li className="flex items-center gap-2">
              <CalendarDays className="size-4 text-sj-muted-foreground" />
              {listing.minDays === listing.maxDays
                ? `${listing.minDays} days`
                : `${listing.minDays}–${listing.maxDays} days`}
              {listing.advanceNoticeDays > 0 &&
                ` · book ${listing.advanceNoticeDays} ${listing.advanceNoticeDays === 1 ? 'day' : 'days'} ahead`}
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-sj-muted-foreground" />
              Refundable deposit {rupees(listing.depositPaise)}
            </li>
            {listing.requiredDocs.length > 0 && (
              <li className="flex items-start gap-2">
                <FileText className="mt-0.5 size-4 shrink-0 text-sj-muted-foreground" />
                <span>
                  The lender asks to see:{' '}
                  {listing.requiredDocs.map((d) => d.note ?? DOC_LABEL[d.docType]).join(', ')}
                </span>
              </li>
            )}
          </ul>
          {listing.blocks.length > 0 && (
            <p className="text-caption text-sj-muted-foreground">
              Not available:{' '}
              {listing.blocks
                .slice(0, 6)
                .map((b) =>
                  b.startsOn === b.endsOn
                    ? shortDate(b.startsOn)
                    : `${shortDate(b.startsOn)}–${shortDate(b.endsOn)}`,
                )
                .join(', ')}
              {listing.blocks.length > 6 && '…'}
            </p>
          )}
        </section>

        <section className="grid gap-3">
          <h2 className="text-h3">
            Reviews{reviews.ratingCount > 0 && ` (${reviews.ratingCount})`}
          </h2>
          {reviews.items.length === 0 ? (
            <p className="text-small text-sj-muted-foreground">No reviews yet.</p>
          ) : (
            <ul className="grid gap-4">
              {reviews.items.map((r) => (
                <li key={r.id} className="flex gap-3">
                  <Avatar name={r.authorName} url={r.authorAvatarUrl} size={36} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-small font-semibold">
                      {r.authorName ?? 'Nivra user'} <Stars rating={r.rating} size={13} />
                      <span className="font-normal text-sj-muted-foreground">
                        {shortDate(r.publishedAt)}
                      </span>
                    </p>
                    {r.comment && <p className="text-small">{r.comment}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="grid content-start gap-4 lg:sticky lg:top-24">
        {mine ? (
          <section
            data-testid="own-listing"
            className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-5 shadow-sm"
          >
            <p>
              <span className="font-display text-h2">{rupees(listing.pricePerDayPaise)}</span>
              <span className="text-sj-muted-foreground"> / day</span>
            </p>
            <p className="font-semibold">This is your listing</p>
            <p className="text-small text-sj-muted-foreground">
              This is how borrowers see it. You can borrow from other people with the same account.
            </p>
            <Button asChild>
              <Link href={`/listings/${listing.id}`}>
                <PencilLine /> Edit listing
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/explore">
                <Compass /> Browse things to borrow
              </Link>
            </Button>
          </section>
        ) : (
          <>
            <section className="relative grid gap-4 rounded-lg border border-sj-border bg-sj-surface p-5 shadow-sm">
              <BorderBeam />
              <p>
                <span className="font-display text-h2">{rupees(listing.pricePerDayPaise)}</span>
                <span className="text-sj-muted-foreground"> / day</span>
              </p>
              <form method="get" className="grid gap-3" aria-label="Check dates">
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-caption font-semibold">
                    From
                    <Input
                      type="date"
                      name="start"
                      min={todayIst()}
                      defaultValue={start ?? ''}
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-caption font-semibold">
                    To
                    <Input
                      type="date"
                      name="end"
                      min={todayIst()}
                      defaultValue={end ?? ''}
                      required
                    />
                  </label>
                </div>
                <Button type="submit" variant="secondary">
                  Check price
                </Button>
              </form>
              {quoteError && <p className="text-small text-sj-danger">{quoteError}</p>}
              {quote && (
                <div className="grid gap-1.5 text-small" data-testid="quote">
                  {!quote.available && quote.unavailableReason && (
                    <p className="rounded-md bg-sj-surface-muted px-3 py-2 text-sj-danger">
                      {UNAVAILABLE[quote.unavailableReason]?.(listing) ??
                        'Not available on these dates.'}
                    </p>
                  )}
                  <Line
                    label={`${rupees(quote.pricePerDayPaise)} × ${quote.days} ${quote.days === 1 ? 'day' : 'days'}`}
                    value={rupees(quote.rentBeforeDiscountPaise)}
                  />
                  {quote.weeklyDiscountPaise > 0 && (
                    <Line label="Weekly discount" value={`−${rupees(quote.weeklyDiscountPaise)}`} />
                  )}
                  <Line label="Service fee" value={rupees(quote.feePaise)} />
                  {quote.creditPaise > 0 && (
                    <Line label="Your credit" value={`−${rupees(quote.creditPaise)}`} />
                  )}
                  <Line label="Refundable deposit" value={rupees(quote.depositPaise)} />
                  <div className="mt-1 border-t border-sj-border pt-2">
                    <Line label="Total today" value={rupees(quote.totalPaise)} strong />
                  </div>
                </div>
              )}
              {quote?.available && start && end && (
                <RequestButton
                  listingId={listing.id}
                  startDate={start}
                  endDate={end}
                  signedIn={signedIn}
                />
              )}
            </section>

            <StartChatButton listingId={listing.id} />
          </>
        )}
        <section className="flex items-center gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
          <Avatar name={lender.name} url={lender.avatarUrl} size={48} />
          <div className="min-w-0">
            <Link href={`/u/${lender.id}`} className="font-semibold hover:underline">
              {lender.name ?? 'Nivra lender'}
            </Link>
            <p className="text-caption text-sj-muted-foreground">
              {lender.city ? `${lender.city} · ` : ''}On Nivra since {longDate(lender.memberSince)}
            </p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              {lender.idVerified && (
                <Badge tone="success">
                  <BadgeCheck className="size-3.5" /> ID verified
                </Badge>
              )}
              {lender.ratingAvg != null && lender.ratingCount > 0 && (
                <Badge tone="neutral">
                  ★ {lender.ratingAvg.toFixed(1)} ({lender.ratingCount})
                </Badge>
              )}
            </p>
          </div>
        </section>
        <p className="text-caption text-sj-muted-foreground">
          Pickup is around {listing.areaLabel ?? 'the lender’s area'}. The exact address is shared
          once a booking is confirmed.{' '}
          <Link href="/how-it-works" className="underline">
            How renting works
          </Link>
        </p>
      </aside>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <p className={`flex justify-between gap-3 ${strong ? 'font-bold' : ''}`}>
      <span className={strong ? '' : 'text-sj-muted-foreground'}>{label}</span>
      <span>{value}</span>
    </p>
  );
}
