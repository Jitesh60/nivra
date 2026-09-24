import { addDays } from '../listings/listing-rules.js';

/** A pending offer lapses after this long if nobody answers. */
export const OFFER_TTL_HOURS = 48;

export type OfferStatusValue =
  'PENDING' | 'ACCEPTED' | 'COUNTERED' | 'DECLINED' | 'EXPIRED' | 'SUPERSEDED';

/** 48 h from now, or the end of the first rental day if that comes sooner. */
export function offerExpiresAt(now: Date, startsOn: Date): Date {
  const ttl = new Date(now.getTime() + OFFER_TTL_HOURS * 3600 * 1000);
  const endOfFirstDay = addDays(startsOn, 1);
  return ttl < endOfFirstDay ? ttl : endOfFirstDay;
}

/**
 * Expiry is applied lazily (no job queue yet): a PENDING offer past its
 * `expiresAt` is EXPIRED, whatever the row still says.
 */
export function effectiveStatus(
  offer: { status: OfferStatusValue; expiresAt: Date },
  now = new Date(),
): OfferStatusValue {
  return offer.status === 'PENDING' && offer.expiresAt <= now ? 'EXPIRED' : offer.status;
}

/** Rent for a negotiated price: the agreed price per day times the days (no weekly discount). */
export function offerRent(pricePerDayPaise: number, days: number): number {
  return pricePerDayPaise * days;
}
