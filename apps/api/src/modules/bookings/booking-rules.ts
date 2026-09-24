import type {
  BookingParty,
  BookingStatus,
  DocumentType,
  RequiredDocType,
} from '../../generated/prisma/client.js';
import { addDays } from '../listings/listing-rules.js';

/**
 * Booking rules as plain functions (no database), so the state machine,
 * the apps' `can` flags and the tests all agree. See docs/ARCHITECTURE.md §5.
 */

/** Still in progress: counts as "the open booking" of a borrower on a listing. */
export const OPEN_STATUSES = [
  'REQUESTED',
  'AWAITING_DOCS',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'ACTIVE',
  'RETURNED',
  'DISPUTED',
] as const satisfies readonly BookingStatus[];

/** The dates are held: no other booking of the listing may overlap (DB constraint). */
export const HELD_STATUSES = [
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'ACTIVE',
  'RETURNED',
  'DISPUTED',
] as const satisfies readonly BookingStatus[];

/** Paid for: the borrower sees the exact address, and the chat is no longer masked. */
export const PAID_STATUSES = [
  'CONFIRMED',
  'ACTIVE',
  'RETURNED',
  'COMPLETED',
  'DISPUTED',
] as const satisfies readonly BookingStatus[];

/** The lender can see shared documents while the booking is in one of these. */
export const DOCUMENT_ACCESS_STATUSES = [
  'AWAITING_DOCS',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'ACTIVE',
  'RETURNED',
  'DISPUTED',
] as const satisfies readonly BookingStatus[];

export const isOpen = (s: BookingStatus) => (OPEN_STATUSES as readonly string[]).includes(s);
export const isHeld = (s: BookingStatus) => (HELD_STATUSES as readonly string[]).includes(s);

export type Actor = BookingParty | 'SYSTEM';

export type BookingAction =
  | 'accept'
  | 'decline'
  | 'cancel'
  | 'submitDocs'
  | 'approveDocs'
  | 'rejectDocs'
  | 'confirmPayment'
  | 'expire'
  | 'handOver'
  | 'markReturned'
  | 'noShow'
  | 'openDispute'
  | 'complete'
  | 'resolveDispute';

export interface BookingState {
  status: BookingStatus;
  /** The listing asks for documents. */
  requiresDocs: boolean;
  /** The borrower has shared them (waiting for the lender's review). */
  docsSubmitted: boolean;
  /** The rental dates (first and last day, inclusive): needed for handover and no-show. */
  startsOn?: Date;
  endsOn?: Date;
  /** When the borrower returned the item (the claim window runs from here). */
  returnedAt?: Date | null;
}

/**
 * Where [action] by [actor] takes the booking at [now], or null if it isn't
 * allowed. Rental steps (handover, return, no-show, disputes) also depend on
 * the dates, so they need `startsOn`/`endsOn`/`returnedAt` in [b].
 */
export function nextStatus(
  action: BookingAction,
  actor: Actor,
  b: BookingState,
  now: Date = new Date(),
): BookingStatus | null {
  switch (action) {
    case 'accept':
      if (actor !== 'LENDER' || b.status !== 'REQUESTED') return null;
      return b.requiresDocs ? 'AWAITING_DOCS' : 'AWAITING_PAYMENT';
    case 'decline':
      return actor === 'LENDER' && b.status === 'REQUESTED' ? 'DECLINED' : null;
    case 'cancel':
      // Once the item has changed hands, problems go through a dispute instead.
      if (actor === 'ADMIN') return isOpen(b.status) && !isRental(b.status) ? 'CANCELLED' : null;
      // A paid booking can be cancelled until handover; the refund follows the policy.
      if (actor === 'BORROWER') {
        return ['REQUESTED', 'AWAITING_DOCS', 'AWAITING_PAYMENT', 'CONFIRMED'].includes(b.status)
          ? 'CANCELLED'
          : null;
      }
      // The lender declines a request instead; after accepting, they can cancel.
      if (actor === 'LENDER') {
        return ['AWAITING_DOCS', 'AWAITING_PAYMENT', 'CONFIRMED'].includes(b.status)
          ? 'CANCELLED'
          : null;
      }
      return null;
    case 'submitDocs':
      return actor === 'BORROWER' && b.status === 'AWAITING_DOCS' && !b.docsSubmitted
        ? 'AWAITING_DOCS'
        : null;
    case 'approveDocs':
      return actor === 'LENDER' && b.status === 'AWAITING_DOCS' && b.docsSubmitted
        ? 'AWAITING_PAYMENT'
        : null;
    case 'rejectDocs':
      return actor === 'LENDER' && b.status === 'AWAITING_DOCS' && b.docsSubmitted
        ? 'DECLINED'
        : null;
    case 'confirmPayment':
      return actor === 'SYSTEM' && b.status === 'AWAITING_PAYMENT' ? 'CONFIRMED' : null;
    case 'expire':
      return actor === 'SYSTEM' &&
        ['REQUESTED', 'AWAITING_DOCS', 'AWAITING_PAYMENT'].includes(b.status)
        ? 'EXPIRED'
        : null;
    case 'handOver':
      return actor === 'LENDER' &&
        b.status === 'CONFIRMED' &&
        b.startsOn !== undefined &&
        b.endsOn !== undefined &&
        now >= handoverOpensAt(b.startsOn) &&
        now < rentalEnd(b.endsOn)
        ? 'ACTIVE'
        : null;
    case 'markReturned':
      return actor === 'BORROWER' && b.status === 'ACTIVE' ? 'RETURNED' : null;
    case 'noShow':
      return actor === 'LENDER' &&
        b.status === 'CONFIRMED' &&
        b.startsOn !== undefined &&
        now >= rentalStart(b.startsOn)
        ? 'CANCELLED'
        : null;
    case 'openDispute':
      if (actor !== 'LENDER') return null;
      if (b.status === 'RETURNED') {
        return b.returnedAt && now < claimUntil(b.returnedAt) ? 'DISPUTED' : null;
      }
      // Not returned: once it's well overdue.
      return b.status === 'ACTIVE' &&
        b.endsOn !== undefined &&
        now >= new Date(rentalEnd(b.endsOn).getTime() + NOT_RETURNED_AFTER_DAYS * DAY_MS)
        ? 'DISPUTED'
        : null;
    case 'complete':
      return actor === 'SYSTEM' && b.status === 'RETURNED' ? 'COMPLETED' : null;
    case 'resolveDispute':
      return actor === 'ADMIN' && b.status === 'DISPUTED' ? 'COMPLETED' : null;
  }
}

/** The item is with the borrower, or being checked after its return. */
export const RENTAL_STATUSES = [
  'ACTIVE',
  'RETURNED',
  'DISPUTED',
] as const satisfies readonly BookingStatus[];

export const isRental = (s: BookingStatus) => (RENTAL_STATUSES as readonly string[]).includes(s);

/** What the viewer can do now; the apps show buttons from this. */
export function allowedActions(
  party: 'BORROWER' | 'LENDER',
  b: BookingState,
  now: Date = new Date(),
) {
  const can = (a: BookingAction) => nextStatus(a, party, b, now) !== null;
  return {
    accept: can('accept'),
    decline: can('decline'),
    cancel: can('cancel'),
    shareDocs: can('submitDocs'),
    reviewDocs: can('approveDocs'),
    pay: party === 'BORROWER' && b.status === 'AWAITING_PAYMENT',
    /** Lender: confirm the handover with the borrower's code (from the day before). */
    handover: can('handOver'),
    /** Borrower: confirm the return with the lender's code. */
    return: can('markReturned'),
    /** Lender: the borrower didn't come for the pickup. */
    noShow: can('noShow'),
    /** Lender: claim from the deposit (in the claim window, or when long overdue). */
    dispute: can('openDispute'),
    /** Show a code to the other person: the borrower's at handover, the lender's at return. */
    showCode:
      (party === 'BORROWER' && b.status === 'CONFIRMED') ||
      (party === 'LENDER' && b.status === 'ACTIVE'),
    /** Add condition photos: at handover while active, at return during the claim window. */
    addPhotos:
      b.status === 'ACTIVE' ||
      (b.status === 'RETURNED' && !!b.returnedAt && now < claimUntil(b.returnedAt)),
  };
}

export interface Windows {
  requestMin: number;
  docsMin: number;
  paymentMin: number;
}

/**
 * The deadline of the step the booking is in, or null when nothing times out.
 * Never later than the end of the first rental day: a request nobody answered
 * in time is no use once the rental should have started.
 */
export function deadlineFor(
  b: BookingState & { startsOn: Date },
  now: Date,
  w: Windows,
): Date | null {
  // After the return, the lender has a claim window; then it completes.
  if (b.status === 'RETURNED') return claimUntil(now);
  const minutes =
    b.status === 'REQUESTED'
      ? w.requestMin
      : b.status === 'AWAITING_DOCS'
        ? w.docsMin
        : b.status === 'AWAITING_PAYMENT'
          ? w.paymentMin
          : null;
  if (minutes === null) return null;
  const step = new Date(now.getTime() + minutes * 60_000);
  const lastChance = addDays(b.startsOn, 1);
  return step < lastChance ? step : lastChance;
}

/** India Standard Time is UTC+5:30, all year. */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** Each side can review for this long after completion… */
export const REVIEW_WINDOW_DAYS = 14;
/** …and a review is published this long after completion even if the other side hasn't written one. */
export const REVIEW_PUBLISH_DAYS = 7;

/** How long the lender has after the return to report a problem. */
export const CLAIM_WINDOW_HOURS = 24;
/** A lender may claim for an item not returned this many days after it was due. */
export const NOT_RETURNED_AFTER_DAYS = 2;

/** Rentals start at midnight IST on the first day. */
export function rentalStart(startsOn: Date): Date {
  return new Date(startsOn.getTime() - IST_OFFSET_MS);
}

/** …and are due back by the end of the last day (midnight IST after it). */
export function rentalEnd(endsOn: Date): Date {
  return new Date(endsOn.getTime() + DAY_MS - IST_OFFSET_MS);
}

/** The handover can be confirmed from the day before the first day (early pickups). */
export function handoverOpensAt(startsOn: Date): Date {
  return new Date(rentalStart(startsOn).getTime() - DAY_MS);
}

export function claimUntil(returnedAt: Date): Date {
  return new Date(returnedAt.getTime() + CLAIM_WINDOW_HOURS * 3_600_000);
}

/** Started days late: 1 minute past midnight is one late day. */
export function lateDaysFor(endsOn: Date, returnedAt: Date): number {
  const late = returnedAt.getTime() - rentalEnd(endsOn).getTime();
  return late > 0 ? Math.ceil(late / DAY_MS) : 0;
}

/** The PRD late fee: 1× the daily rate per late day, never more than the deposit. */
export function lateFeeFor(
  lateDays: number,
  pricePerDayPaise: number,
  depositPaise: number,
): number {
  return Math.min(lateDays * pricePerDayPaise, depositPaise);
}

/** What an admin can still let the lender keep after the late fee. */
export function maxKeepable(depositPaise: number, lateFeePaise: number): number {
  return Math.max(0, depositPaise - lateFeePaise);
}

export interface Refund {
  tier: 'FULL' | 'HALF_RENT' | 'DEPOSIT_ONLY';
  rentPaise: number;
  feePaise: number;
  depositPaise: number;
  totalPaise: number;
}

/**
 * The PRD cancellation policy, for a paid booking (applied in Phase 7):
 * a borrower gets everything back more than 48 h before the start, half the
 * rent 24–48 h before, and no rent under 24 h. The deposit always comes back.
 * If the lender (or Sajha) cancels, the borrower gets everything back.
 */
export function refundFor(
  b: { rentPaise: number; feePaise: number; depositPaise: number; startsOn: Date },
  cancelledBy: BookingParty,
  now: Date,
): Refund {
  const hoursBefore = (rentalStart(b.startsOn).getTime() - now.getTime()) / 3_600_000;
  const tier: Refund['tier'] =
    cancelledBy !== 'BORROWER' || hoursBefore > 48
      ? 'FULL'
      : hoursBefore >= 24
        ? 'HALF_RENT'
        : 'DEPOSIT_ONLY';
  const rent =
    tier === 'FULL' ? b.rentPaise : tier === 'HALF_RENT' ? Math.round(b.rentPaise / 2) : 0;
  const fee = tier === 'FULL' ? b.feePaise : 0;
  return {
    tier,
    rentPaise: rent,
    feePaise: fee,
    depositPaise: b.depositPaise,
    totalPaise: rent + fee + b.depositPaise,
  };
}

/** Which vault documents satisfy what a listing asks for. */
export function docTypesFor(required: RequiredDocType): DocumentType[] | 'ANY' {
  switch (required) {
    case 'GOVERNMENT_ID':
      return ['AADHAAR_MASKED', 'PAN', 'DRIVING_LICENCE', 'PASSPORT', 'VOTER_ID'];
    case 'COLLEGE_OR_EMPLOYEE_ID':
      return ['COLLEGE_ID', 'EMPLOYEE_ID'];
    case 'ADDRESS_PROOF':
      return ['ADDRESS_PROOF', 'AADHAAR_MASKED', 'DRIVING_LICENCE', 'PASSPORT', 'VOTER_ID'];
    case 'OTHER':
      return 'ANY';
  }
}

export function satisfies(required: RequiredDocType, type: DocumentType): boolean {
  const allowed = docTypesFor(required);
  return allowed === 'ANY' || allowed.includes(type);
}
