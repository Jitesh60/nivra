import type { LedgerAccount } from '../../generated/prisma/client.js';

/**
 * Double-entry postings for every money movement (docs/ARCHITECTURE.md §6).
 * Pure: the payments service writes them in one database transaction, and a
 * deferred trigger refuses any transaction whose debits and credits differ.
 */
export interface Line {
  account: LedgerAccount;
  debitPaise?: number;
  creditPaise?: number;
}

export interface Amounts {
  rentPaise: number;
  feePaise: number;
  depositPaise: number;
}

/** Sajha's commission on [rentPaise] (basis points), rounded to the paisa. */
export function commissionOn(rentPaise: number, bps: number): number {
  return Math.round((rentPaise * bps) / 10_000);
}

/** What the lender is owed for [rentPaise] of rent. */
export function lenderShare(rentPaise: number, bps: number): number {
  return rentPaise - commissionOn(rentPaise, bps);
}

/** A booking's payment arrives: deposit held, the lender's share owed, the rest is Sajha's. */
export function capturePostings(a: Amounts, bps: number): Line[] {
  const commission = commissionOn(a.rentPaise, bps);
  return drop([
    { account: 'GATEWAY', debitPaise: a.rentPaise + a.feePaise + a.depositPaise },
    { account: 'DEPOSIT_HELD', creditPaise: a.depositPaise },
    { account: 'LENDER_PAYABLE', creditPaise: a.rentPaise - commission },
    { account: 'PLATFORM_REVENUE', creditPaise: commission + a.feePaise },
  ]);
}

/**
 * Money going back to the borrower from a booking of [totalRent] rent:
 * [refund] says how much of each part. The commission follows the rent, so
 * what's left owed to the lender is exactly their share of the rent they keep.
 */
export function refundPostings(refund: Amounts, totalRentPaise: number, bps: number): Line[] {
  const commissionBack =
    commissionOn(totalRentPaise, bps) - commissionOn(totalRentPaise - refund.rentPaise, bps);
  return drop([
    { account: 'DEPOSIT_HELD', debitPaise: refund.depositPaise },
    { account: 'LENDER_PAYABLE', debitPaise: refund.rentPaise - commissionBack },
    { account: 'PLATFORM_REVENUE', debitPaise: commissionBack + refund.feePaise },
    {
      account: 'GATEWAY',
      creditPaise: refund.rentPaise + refund.feePaise + refund.depositPaise,
    },
  ]);
}

/** An admin gives money back as goodwill: Sajha bears it. */
export function goodwillPostings(amountPaise: number): Line[] {
  return [
    { account: 'GOODWILL', debitPaise: amountPaise },
    { account: 'GATEWAY', creditPaise: amountPaise },
  ];
}

/** The lender's share leaves Sajha's Razorpay balance for their linked account. */
export function transferPostings(amountPaise: number): Line[] {
  return [
    { account: 'LENDER_PAYABLE', debitPaise: amountPaise },
    { account: 'GATEWAY', creditPaise: amountPaise },
  ];
}

/**
 * After the rental, the lender keeps part of the deposit (a late fee, or what
 * an admin awarded in a dispute). No commission: it's compensation, not rent.
 * It then leaves as a transfer (`transferPostings`).
 */
export function depositKeepPostings(amountPaise: number): Line[] {
  return [
    { account: 'DEPOSIT_HELD', debitPaise: amountPaise },
    { account: 'LENDER_PAYABLE', creditPaise: amountPaise },
  ];
}

/** A transfer comes back (the booking was cancelled before the return). */
export function reversalPostings(amountPaise: number): Line[] {
  return [
    { account: 'GATEWAY', debitPaise: amountPaise },
    { account: 'LENDER_PAYABLE', creditPaise: amountPaise },
  ];
}

export function isBalanced(lines: Line[]): boolean {
  const debit = lines.reduce((s, l) => s + (l.debitPaise ?? 0), 0);
  const credit = lines.reduce((s, l) => s + (l.creditPaise ?? 0), 0);
  return (
    debit === credit && lines.every((l) => (l.debitPaise ?? 0) >= 0 && (l.creditPaise ?? 0) >= 0)
  );
}

/** Zero lines add nothing (and a ledger row must be a debit or a credit). */
function drop(lines: Line[]): Line[] {
  return lines.filter((l) => (l.debitPaise ?? 0) + (l.creditPaise ?? 0) > 0);
}
