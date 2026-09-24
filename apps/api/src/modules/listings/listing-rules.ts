/**
 * Marketplace rules for listings (PRD §7 defaults). The database enforces the
 * same ranges with CHECK constraints; the apps read them from GET /v1/config.
 */
export const LISTING_RULES = {
  /** Platform commission on rent, in basis points (10%). */
  commissionBps: 1000,
  pricePerDayPaise: { min: 1_000, max: 1_000_000 },
  depositPaise: { min: 0, max: 5_000_000 },
  weeklyDiscountPct: { min: 0, max: 50 },
  rentalDays: { min: 1, max: 90, defaultMax: 30 },
  advanceNoticeDays: { min: 0, max: 7 },
  photos: { min: 1, max: 8 },
  blocks: { maxRanges: 50, horizonDays: 365 },
} as const;

/**
 * Public position of a listing: rounded to 2 decimals (~1 km), so the exact
 * pickup point can't be read off the map before a booking.
 */
export function approximate(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Today as a UTC date (listings work in whole days). */
export function todayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
