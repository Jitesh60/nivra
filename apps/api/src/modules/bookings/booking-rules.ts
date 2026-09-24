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
  'accept' | 'decline' | 'cancel' | 'submitDocs' | 'approveDocs' | 'rejectDocs' | 'expire';

export interface BookingState {
  status: BookingStatus;
  /** The listing asks for documents. */
  requiresDocs: boolean;
  /** The borrower has shared them (waiting for the lender's review). */
  docsSubmitted: boolean;
}

/**
 * Where [action] by [actor] takes the booking, or null if it isn't allowed.
 * Payment (Phase 7) and handover (Phase 8) add their own transitions.
 */
export function nextStatus(
  action: BookingAction,
  actor: Actor,
  b: BookingState,
): BookingStatus | null {
  switch (action) {
    case 'accept':
      if (actor !== 'LENDER' || b.status !== 'REQUESTED') return null;
      return b.requiresDocs ? 'AWAITING_DOCS' : 'AWAITING_PAYMENT';
    case 'decline':
      return actor === 'LENDER' && b.status === 'REQUESTED' ? 'DECLINED' : null;
    case 'cancel':
      if (actor === 'ADMIN') return isOpen(b.status) ? 'CANCELLED' : null;
      if (actor === 'BORROWER') {
        return ['REQUESTED', 'AWAITING_DOCS', 'AWAITING_PAYMENT'].includes(b.status)
          ? 'CANCELLED'
          : null;
      }
      // The lender declines a request instead; after accepting, they can cancel.
      if (actor === 'LENDER') {
        return ['AWAITING_DOCS', 'AWAITING_PAYMENT'].includes(b.status) ? 'CANCELLED' : null;
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
    case 'expire':
      return actor === 'SYSTEM' &&
        ['REQUESTED', 'AWAITING_DOCS', 'AWAITING_PAYMENT'].includes(b.status)
        ? 'EXPIRED'
        : null;
  }
}

/** What the viewer can do now; the apps show buttons from this. */
export function allowedActions(party: 'BORROWER' | 'LENDER', b: BookingState) {
  const can = (a: BookingAction) => nextStatus(a, party, b) !== null;
  return {
    accept: can('accept'),
    decline: can('decline'),
    cancel: can('cancel'),
    shareDocs: can('submitDocs'),
    reviewDocs: can('approveDocs'),
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

/** Rentals start at midnight IST on the first day. */
export function rentalStart(startsOn: Date): Date {
  return new Date(startsOn.getTime() - IST_OFFSET_MS);
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
