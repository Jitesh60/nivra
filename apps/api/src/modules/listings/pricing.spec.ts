import { quote, rentalDays, rentFor } from './pricing.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const tent = {
  pricePerDayPaise: 15_000,
  weeklyDiscountPct: 10,
  depositPaise: 100_000,
  minDays: 2,
  maxDays: 14,
  advanceNoticeDays: 1,
  blocks: [{ startsOn: day('2026-10-10'), endsOn: day('2026-10-12') }],
};
const today = day('2026-10-01');

describe('pricing', () => {
  it('counts rental days inclusively', () => {
    expect(rentalDays(day('2026-10-02'), day('2026-10-05'))).toBe(4);
    expect(rentalDays(day('2026-10-02'), day('2026-10-02'))).toBe(1);
  });

  it('applies the weekly discount from 7 days on', () => {
    expect(rentFor(tent, 6)).toEqual({ before: 90_000, discount: 0, rent: 90_000 });
    expect(rentFor(tent, 7)).toEqual({ before: 105_000, discount: 10_500, rent: 94_500 });
    expect(rentFor({ pricePerDayPaise: 1_999, weeklyDiscountPct: 15 }, 7)).toEqual({
      before: 13_993,
      discount: 2_099,
      rent: 11_894,
    });
  });

  it('quotes rent, fee, deposit and total', () => {
    expect(quote(tent, day('2026-10-02'), day('2026-10-05'), today)).toEqual({
      days: 4,
      pricePerDayPaise: 15_000,
      rentBeforeDiscountPaise: 60_000,
      weeklyDiscountPaise: 0,
      rentPaise: 60_000,
      feePaise: 0,
      depositPaise: 100_000,
      totalPaise: 160_000,
      available: true,
      unavailableReason: null,
    });
  });

  it('explains why dates do not work', () => {
    const reason = (start: string, end: string) =>
      quote(tent, day(start), day(end), today).unavailableReason;
    expect(reason('2026-10-03', '2026-10-03')).toBe('TOO_SHORT');
    expect(reason('2026-10-02', '2026-10-20')).toBe('TOO_LONG');
    expect(reason('2026-10-01', '2026-10-03')).toBe('NOT_ENOUGH_NOTICE');
    expect(reason('2026-10-08', '2026-10-10')).toBe('BLOCKED');
    expect(reason('2026-10-12', '2026-10-14')).toBe('BLOCKED');
    expect(reason('2026-10-13', '2026-10-15')).toBeNull();
  });
});
