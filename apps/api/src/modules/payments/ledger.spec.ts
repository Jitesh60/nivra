import {
  capturePostings,
  commissionOn,
  depositKeepPostings,
  goodwillPostings,
  isBalanced,
  type Line,
  lenderShare,
  refundPostings,
  reversalPostings,
  transferPostings,
} from './ledger.js';

const BPS = 1000; // 10%
const booking = { rentPaise: 45_000, feePaise: 0, depositPaise: 100_000 };

/** Net balance per account (credits minus debits) after [txns]. */
function balances(...txns: Line[][]) {
  const out: Record<string, number> = {};
  for (const l of txns.flat()) {
    out[l.account] = (out[l.account] ?? 0) + (l.creditPaise ?? 0) - (l.debitPaise ?? 0);
  }
  return out;
}

describe('ledger postings', () => {
  it('a payment: deposit held, lender owed rent less 10%, Sajha keeps the commission', () => {
    const lines = capturePostings(booking, BPS);
    expect(isBalanced(lines)).toBe(true);
    expect(balances(lines)).toEqual({
      GATEWAY: -145_000,
      DEPOSIT_HELD: 100_000,
      LENDER_PAYABLE: 40_500,
      PLATFORM_REVENUE: 4_500,
    });
    expect(lenderShare(45_000, BPS)).toBe(40_500);
  });

  it('a full refund undoes the payment exactly', () => {
    const txns = [capturePostings(booking, BPS), refundPostings(booking, booking.rentPaise, BPS)];
    expect(txns.every(isBalanced)).toBe(true);
    expect(balances(...txns)).toEqual({
      GATEWAY: 0,
      DEPOSIT_HELD: 0,
      LENDER_PAYABLE: 0,
      PLATFORM_REVENUE: 0,
    });
  });

  it('half the rent back: the lender keeps their share of the other half', () => {
    const refund = { rentPaise: 22_500, feePaise: 0, depositPaise: 100_000 };
    const txns = [capturePostings(booking, BPS), refundPostings(refund, 45_000, BPS)];
    expect(txns.every(isBalanced)).toBe(true);
    const b = balances(...txns);
    // Rounding follows the rent kept: 10% of 22,500 is 2,250.
    expect(b.LENDER_PAYABLE).toBe(lenderShare(22_500, BPS));
    expect(b.PLATFORM_REVENUE).toBe(commissionOn(22_500, BPS));
    expect(b.DEPOSIT_HELD).toBe(0);
    expect(b.GATEWAY).toBe(-22_500);
  });

  it('odd amounts still balance and never go negative', () => {
    const odd = { rentPaise: 33_333, feePaise: 17, depositPaise: 1 };
    const half = { rentPaise: 16_667, feePaise: 0, depositPaise: 1 };
    for (const lines of [capturePostings(odd, BPS), refundPostings(half, 33_333, BPS)]) {
      expect(isBalanced(lines)).toBe(true);
    }
    const b = balances(capturePostings(odd, BPS), refundPostings(half, 33_333, BPS));
    expect(b.LENDER_PAYABLE).toBe(lenderShare(33_333 - 16_667, BPS));
  });

  it('transfers, reversals and goodwill move money between the right accounts', () => {
    const paid = capturePostings(booking, BPS);
    const out = transferPostings(40_500);
    const back = reversalPostings(40_500);
    const goodwill = goodwillPostings(5_000);
    for (const t of [out, back, goodwill]) expect(isBalanced(t)).toBe(true);
    expect(balances(paid, out).LENDER_PAYABLE).toBe(0);
    expect(balances(paid, out, back).LENDER_PAYABLE).toBe(40_500);
    // Credit-minus-debit: money leaving the gateway is a credit to it.
    expect(balances(goodwill)).toEqual({ GOODWILL: -5_000, GATEWAY: 5_000 });
  });

  it('after the rental: rent released, part of the deposit kept, the rest refunded', () => {
    // ₹450 rent, ₹1,000 deposit; the lender keeps ₹300 of it (late fee + damage).
    const paid = capturePostings(booking, BPS);
    const rent = transferPostings(40_500);
    const keep = depositKeepPostings(30_000);
    const keptOut = transferPostings(30_000);
    const back = refundPostings(
      { rentPaise: 0, feePaise: 0, depositPaise: 70_000 },
      booking.rentPaise,
      BPS,
    );
    for (const t of [keep, keptOut, back]) expect(isBalanced(t)).toBe(true);
    const net = balances(paid, rent, keep, keptOut, back);
    // Everything owed has left: only Sajha's commission stays in the gateway.
    expect(net).toMatchObject({ DEPOSIT_HELD: 0, LENDER_PAYABLE: 0, PLATFORM_REVENUE: 4_500 });
    expect(net.GATEWAY).toBe(-4_500);
  });

  it('refuses nothing it shouldn’t: zero parts are left out', () => {
    const noDeposit = capturePostings({ rentPaise: 1_000, feePaise: 0, depositPaise: 0 }, BPS);
    expect(noDeposit.map((l) => l.account)).toEqual([
      'GATEWAY',
      'LENDER_PAYABLE',
      'PLATFORM_REVENUE',
    ]);
  });
});
