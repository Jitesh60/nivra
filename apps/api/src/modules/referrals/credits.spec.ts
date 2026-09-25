import { creditBackFor, creditLimitFor, REFERRAL_RULES } from './credits.js';

describe('referral credit rules', () => {
  it('covers at most half the rent', () => {
    expect(REFERRAL_RULES.maxShareOfRentBps).toBe(5_000);
    expect(creditLimitFor(30_000)).toBe(15_000);
    expect(creditLimitFor(5_001)).toBe(2_500);
    expect(creditLimitFor(0)).toBe(0);
  });

  it('comes back first on a cancellation refund, never more than was used', () => {
    expect(creditBackFor(10_000, 30_000)).toBe(10_000); // full refund
    expect(creditBackFor(10_000, 15_000)).toBe(10_000); // half the rent
    expect(creditBackFor(10_000, 5_000)).toBe(5_000);
    expect(creditBackFor(10_000, 0)).toBe(0); // deposit only: the credit is spent
    expect(creditBackFor(0, 30_000)).toBe(0);
  });
});
