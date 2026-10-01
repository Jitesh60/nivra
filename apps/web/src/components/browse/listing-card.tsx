import { ImageOff, MapPin, Star } from 'lucide-react';
import Link from 'next/link';
import type { ListingCard as Card } from '@/lib/discovery';
import { rupees } from '@/lib/format';
import { SaveButton } from './save-button';

/** A listing in a grid: photo, title, price per day, area and rating. */
export function ListingCard({
  listing,
  dates,
  index = 0,
}: {
  listing: Card;
  dates?: string;
  /** Position in the grid, for the staggered entrance. */
  index?: number;
}) {
  const href = `/item/${listing.id}${dates ? `?${dates}` : ''}`;
  return (
    <article className="group rise-in relative" style={{ '--i': index } as React.CSSProperties}>
      <Link href={href} className="block rounded-lg focus-visible:outline-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-sj-surface-muted shadow-xs transition-[transform,box-shadow] duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-lg">
          {listing.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- public storage URL
            <img
              src={listing.thumbUrl}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <span className="grid size-full place-items-center text-sj-muted-foreground">
              <ImageOff className="size-6" />
            </span>
          )}
          {!listing.available && (
            <span className="absolute bottom-2 left-2 rounded-full bg-ink-950/80 px-2.5 py-1 text-caption font-semibold text-white">
              Not free on your dates
            </span>
          )}
        </div>
        <div className="mt-2 grid gap-0.5">
          <h3 className="truncate text-body font-semibold text-sj-foreground">{listing.title}</h3>
          <p className="flex items-center gap-1 truncate text-caption text-sj-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            {listing.areaLabel ?? listing.category.name}
            {listing.distanceKm != null && ` · ${listing.distanceKm.toFixed(1)} km`}
          </p>
          <p className="flex items-center justify-between gap-2 text-small">
            <span>
              <span className="font-bold text-sj-foreground">
                {rupees(listing.pricePerDayPaise)}
              </span>
              <span className="text-sj-muted-foreground"> / day</span>
              {listing.rentPaise != null && listing.days != null && (
                <span className="text-sj-muted-foreground">
                  {' '}
                  · {rupees(listing.rentPaise)} for {listing.days}{' '}
                  {listing.days === 1 ? 'day' : 'days'}
                </span>
              )}
            </span>
            {listing.ratingAvg != null && listing.ratingCount > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 text-caption font-semibold">
                <Star className="size-3.5 fill-sj-warning text-sj-warning" />
                {listing.ratingAvg.toFixed(1)}
              </span>
            )}
          </p>
        </div>
      </Link>
      <SaveButton
        listingId={listing.id}
        saved={listing.saved}
        title={listing.title}
        size="sm"
        className="absolute top-2 right-2 transition-transform duration-300 group-hover:-translate-y-1"
      />
    </article>
  );
}

export function ListingGrid({ listings, dates }: { listings: Card[]; dates?: string }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {listings.map((l, i) => (
        <ListingCard key={l.id} listing={l} dates={dates} index={i} />
      ))}
    </div>
  );
}
