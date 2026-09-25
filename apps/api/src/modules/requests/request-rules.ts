/** Requests board rules (Phase 10). */
export const REQUEST_RULES = {
  /** Open requests one person can have at a time. */
  maxOpen: 5,
  /** New requests per person per day. */
  perDay: 5,
  /** A request with no end date closes after this many days. */
  maxDays: 30,
  /** Dates can be at most this far ahead. */
  maxAheadDays: 365,
  /** Responses per lender per day. */
  responsesPerDay: 20,
  /** Radius for the board (default) and for telling lenders about a new request. */
  nearbyKm: 10,
  /** Lenders told about one new request, at most… */
  notifyLenders: 50,
  /** …and new-request notices one lender gets a day, at most. */
  noticesPerLenderPerDay: 3,
} as const;

const DAY_MS = 24 * 3600 * 1000;

/** The day after the end date (IST midnight is close enough: requests aren't to the minute), or 30 days. */
export function requestExpiresAt(now: Date, endDate?: Date | null): Date {
  const cap = new Date(now.getTime() + REQUEST_RULES.maxDays * DAY_MS);
  if (!endDate) return cap;
  const dayAfter = new Date(endDate.getTime() + DAY_MS);
  return dayAfter < cap ? dayAfter : cap;
}
