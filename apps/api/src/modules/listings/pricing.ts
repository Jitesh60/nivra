import { addDays } from './listing-rules.js';

/** Borrower service fee (PRD: ₹0 for the MVP; bookings in Phase 6 reuse this). */
export const BORROWER_FEE_BPS = 0;

export type UnavailableReason = 'BLOCKED' | 'TOO_SHORT' | 'TOO_LONG' | 'NOT_ENOUGH_NOTICE';

export interface PricingInput {
  pricePerDayPaise: number;
  weeklyDiscountPct: number;
  depositPaise: number;
  minDays: number;
  maxDays: number;
  advanceNoticeDays: number;
  /** Inclusive blocked ranges (dates at UTC midnight). */
  blocks: { startsOn: Date; endsOn: Date }[];
}

export interface Quote {
  days: number;
  pricePerDayPaise: number;
  rentBeforeDiscountPaise: number;
  weeklyDiscountPaise: number;
  rentPaise: number;
  feePaise: number;
  depositPaise: number;
  totalPaise: number;
  available: boolean;
  unavailableReason: UnavailableReason | null;
}

/**
 * Rental days are inclusive: from the pickup day to the return day, so
 * 2 Oct → 5 Oct is 4 days, and a same-day rental is 1 day.
 */
export function rentalDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** Rent for [days], with the weekly discount from 7 days on. */
export function rentFor(
  input: Pick<PricingInput, 'pricePerDayPaise' | 'weeklyDiscountPct'>,
  days: number,
) {
  const before = input.pricePerDayPaise * days;
  const discount = days >= 7 ? Math.round((before * input.weeklyDiscountPct) / 100) : 0;
  return { before, discount, rent: before - discount };
}

/** Price breakdown and availability for renting from [start] to [end] (inclusive). */
export function quote(input: PricingInput, start: Date, end: Date, today: Date): Quote {
  const days = rentalDays(start, end);
  const { before, discount, rent } = rentFor(input, days);
  const fee = Math.round((rent * BORROWER_FEE_BPS) / 10_000);
  const reason: UnavailableReason | null =
    days < input.minDays
      ? 'TOO_SHORT'
      : days > input.maxDays
        ? 'TOO_LONG'
        : start < addDays(today, input.advanceNoticeDays)
          ? 'NOT_ENOUGH_NOTICE'
          : input.blocks.some((b) => b.startsOn <= end && b.endsOn >= start)
            ? 'BLOCKED'
            : null;
  return {
    days,
    pricePerDayPaise: input.pricePerDayPaise,
    rentBeforeDiscountPaise: before,
    weeklyDiscountPaise: discount,
    rentPaise: rent,
    feePaise: fee,
    depositPaise: input.depositPaise,
    totalPaise: rent + fee + input.depositPaise,
    available: reason === null,
    unavailableReason: reason,
  };
}
