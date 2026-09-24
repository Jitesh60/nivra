import {
  allowedActions,
  claimUntil,
  deadlineFor,
  handoverOpensAt,
  lateDaysFor,
  lateFeeFor,
  maxKeepable,
  rentalEnd,
  docTypesFor,
  isHeld,
  isOpen,
  nextStatus,
  refundFor,
  rentalStart,
  satisfies,
} from './booking-rules.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const state = (
  status: Parameters<typeof nextStatus>[2]['status'],
  requiresDocs = false,
  docsSubmitted = false,
) => ({ status, requiresDocs, docsSubmitted });

describe('booking transitions', () => {
  it('the lender accepts a request into documents or payment, or declines it', () => {
    expect(nextStatus('accept', 'LENDER', state('REQUESTED', true))).toBe('AWAITING_DOCS');
    expect(nextStatus('accept', 'LENDER', state('REQUESTED'))).toBe('AWAITING_PAYMENT');
    expect(nextStatus('decline', 'LENDER', state('REQUESTED'))).toBe('DECLINED');
    // Not the borrower, and not twice.
    expect(nextStatus('accept', 'BORROWER', state('REQUESTED'))).toBeNull();
    expect(nextStatus('accept', 'LENDER', state('AWAITING_PAYMENT'))).toBeNull();
    expect(nextStatus('decline', 'LENDER', state('AWAITING_DOCS', true))).toBeNull();
  });

  it('documents: the borrower shares once, then the lender approves or rejects', () => {
    expect(nextStatus('submitDocs', 'BORROWER', state('AWAITING_DOCS', true))).toBe(
      'AWAITING_DOCS',
    );
    expect(nextStatus('submitDocs', 'BORROWER', state('AWAITING_DOCS', true, true))).toBeNull();
    expect(nextStatus('submitDocs', 'LENDER', state('AWAITING_DOCS', true))).toBeNull();
    // Nothing to review until they're shared.
    expect(nextStatus('approveDocs', 'LENDER', state('AWAITING_DOCS', true))).toBeNull();
    expect(nextStatus('approveDocs', 'LENDER', state('AWAITING_DOCS', true, true))).toBe(
      'AWAITING_PAYMENT',
    );
    expect(nextStatus('rejectDocs', 'LENDER', state('AWAITING_DOCS', true, true))).toBe('DECLINED');
    expect(nextStatus('approveDocs', 'BORROWER', state('AWAITING_DOCS', true, true))).toBeNull();
  });

  it('who may cancel when', () => {
    for (const s of ['REQUESTED', 'AWAITING_DOCS', 'AWAITING_PAYMENT'] as const) {
      expect(nextStatus('cancel', 'BORROWER', state(s))).toBe('CANCELLED');
    }
    // The lender declines a request rather than cancelling it.
    expect(nextStatus('cancel', 'LENDER', state('REQUESTED'))).toBeNull();
    expect(nextStatus('cancel', 'LENDER', state('AWAITING_DOCS'))).toBe('CANCELLED');
    expect(nextStatus('cancel', 'LENDER', state('AWAITING_PAYMENT'))).toBe('CANCELLED');
    // Paid bookings can be cancelled until handover (refunded by the policy).
    expect(nextStatus('cancel', 'BORROWER', state('CONFIRMED'))).toBe('CANCELLED');
    expect(nextStatus('cancel', 'LENDER', state('CONFIRMED'))).toBe('CANCELLED');
    expect(nextStatus('cancel', 'ADMIN', state('CONFIRMED'))).toBe('CANCELLED');
    expect(nextStatus('cancel', 'BORROWER', state('ACTIVE'))).toBeNull();
    expect(nextStatus('cancel', 'ADMIN', state('EXPIRED'))).toBeNull();
    expect(nextStatus('cancel', 'SYSTEM', state('REQUESTED'))).toBeNull();
  });

  it('only the system confirms a payment, and only while it’s awaited', () => {
    expect(nextStatus('confirmPayment', 'SYSTEM', state('AWAITING_PAYMENT'))).toBe('CONFIRMED');
    expect(nextStatus('confirmPayment', 'SYSTEM', state('EXPIRED'))).toBeNull();
    expect(nextStatus('confirmPayment', 'BORROWER', state('AWAITING_PAYMENT'))).toBeNull();
  });

  it('only the system expires, and only the waiting steps', () => {
    expect(nextStatus('expire', 'SYSTEM', state('REQUESTED'))).toBe('EXPIRED');
    expect(nextStatus('expire', 'SYSTEM', state('AWAITING_DOCS'))).toBe('EXPIRED');
    expect(nextStatus('expire', 'SYSTEM', state('AWAITING_PAYMENT'))).toBe('EXPIRED');
    expect(nextStatus('expire', 'SYSTEM', state('CONFIRMED'))).toBeNull();
    expect(nextStatus('expire', 'ADMIN', state('REQUESTED'))).toBeNull();
  });

  it('`can` flags follow the rules for each side', () => {
    expect(allowedActions('LENDER', state('REQUESTED'))).toEqual({
      accept: true,
      decline: true,
      cancel: false,
      shareDocs: false,
      reviewDocs: false,
      pay: false,
      handover: false,
      return: false,
      noShow: false,
      dispute: false,
      showCode: false,
      addPhotos: false,
    });
    expect(allowedActions('BORROWER', state('AWAITING_PAYMENT')).pay).toBe(true);
    expect(allowedActions('LENDER', state('AWAITING_PAYMENT')).pay).toBe(false);
    expect(allowedActions('BORROWER', state('AWAITING_DOCS', true))).toMatchObject({
      shareDocs: true,
      cancel: true,
      accept: false,
    });
    expect(allowedActions('LENDER', state('AWAITING_DOCS', true, true))).toMatchObject({
      reviewDocs: true,
      cancel: true,
    });
    expect(Object.values(allowedActions('BORROWER', state('DECLINED')))).not.toContain(true);
  });

  it('open and held statuses', () => {
    expect(isOpen('REQUESTED')).toBe(true);
    expect(isOpen('EXPIRED')).toBe(false);
    expect(isHeld('AWAITING_DOCS')).toBe(false);
    expect(isHeld('AWAITING_PAYMENT')).toBe(true);
  });
});

describe('deadlines', () => {
  const w = { requestMin: 24 * 60, docsMin: 24 * 60, paymentMin: 120 };
  const now = new Date('2026-10-01T10:00:00Z');

  it('each waiting step has its own window', () => {
    const b = { ...state('REQUESTED'), startsOn: day('2026-10-20') };
    expect(deadlineFor(b, now, w)).toEqual(new Date('2026-10-02T10:00:00Z'));
    expect(deadlineFor({ ...b, status: 'AWAITING_PAYMENT' }, now, w)).toEqual(
      new Date('2026-10-01T12:00:00Z'),
    );
    expect(deadlineFor({ ...b, status: 'CONFIRMED' }, now, w)).toBeNull();
  });

  it('never runs past the end of the first rental day', () => {
    const b = { ...state('REQUESTED'), startsOn: day('2026-10-01') };
    expect(deadlineFor(b, now, w)).toEqual(new Date('2026-10-02T00:00:00Z'));
  });
});

describe('cancellation refunds (PRD policy)', () => {
  const b = { rentPaise: 60_000, feePaise: 0, depositPaise: 100_000, startsOn: day('2026-10-10') };
  // Rentals start at midnight IST: 2026-10-09 18:30 UTC.

  it('rentals start at midnight IST', () => {
    expect(rentalStart(b.startsOn)).toEqual(new Date('2026-10-09T18:30:00Z'));
  });

  it('borrower: full refund > 48 h before, half the rent 24–48 h, deposit only < 24 h', () => {
    expect(refundFor(b, 'BORROWER', new Date('2026-10-07T18:00:00Z'))).toEqual({
      tier: 'FULL',
      rentPaise: 60_000,
      feePaise: 0,
      depositPaise: 100_000,
      totalPaise: 160_000,
    });
    expect(refundFor(b, 'BORROWER', new Date('2026-10-08T12:00:00Z'))).toMatchObject({
      tier: 'HALF_RENT',
      rentPaise: 30_000,
      totalPaise: 130_000,
    });
    expect(refundFor(b, 'BORROWER', new Date('2026-10-09T10:00:00Z'))).toMatchObject({
      tier: 'DEPOSIT_ONLY',
      rentPaise: 0,
      depositPaise: 100_000,
      totalPaise: 100_000,
    });
  });

  it('a lender or Sajha cancelling refunds everything, even at the last minute', () => {
    const late = new Date('2026-10-09T18:00:00Z');
    expect(refundFor(b, 'LENDER', late).tier).toBe('FULL');
    expect(refundFor(b, 'ADMIN', late).totalPaise).toBe(160_000);
  });
});

describe('which documents satisfy a request', () => {
  it('maps the listing’s document kinds to vault document types', () => {
    expect(satisfies('GOVERNMENT_ID', 'PAN')).toBe(true);
    expect(satisfies('GOVERNMENT_ID', 'COLLEGE_ID')).toBe(false);
    expect(satisfies('COLLEGE_OR_EMPLOYEE_ID', 'EMPLOYEE_ID')).toBe(true);
    expect(satisfies('ADDRESS_PROOF', 'DRIVING_LICENCE')).toBe(true);
    expect(satisfies('ADDRESS_PROOF', 'PAN')).toBe(false);
    expect(satisfies('OTHER', 'OTHER')).toBe(true);
    expect(docTypesFor('OTHER')).toBe('ANY');
  });
});

describe('the rental', () => {
  // A booking for 12–14 Oct (IST): starts 11 Oct 18:30 UTC, due 14 Oct 18:30 UTC.
  const rental = (status: Parameters<typeof nextStatus>[2]['status'], returnedAt?: Date) => ({
    ...state(status),
    startsOn: day('2026-10-12'),
    endsOn: day('2026-10-14'),
    returnedAt: returnedAt ?? null,
  });
  const at = (iso: string) => new Date(iso);

  it('dates: due at midnight IST after the last day; handover opens the day before', () => {
    expect(rentalEnd(day('2026-10-14'))).toEqual(at('2026-10-14T18:30:00Z'));
    expect(handoverOpensAt(day('2026-10-12'))).toEqual(at('2026-10-10T18:30:00Z'));
    expect(claimUntil(at('2026-10-14T10:00:00Z'))).toEqual(at('2026-10-15T10:00:00Z'));
  });

  it('the lender hands over from the day before until the end date', () => {
    const b = rental('CONFIRMED');
    expect(nextStatus('handOver', 'LENDER', b, at('2026-10-10T18:00:00Z'))).toBeNull();
    expect(nextStatus('handOver', 'LENDER', b, at('2026-10-11T09:00:00Z'))).toBe('ACTIVE');
    expect(nextStatus('handOver', 'LENDER', b, at('2026-10-14T18:30:00Z'))).toBeNull();
    expect(nextStatus('handOver', 'BORROWER', b, at('2026-10-12T09:00:00Z'))).toBeNull();
    // Without the dates, nothing time-dependent is allowed.
    expect(nextStatus('handOver', 'LENDER', state('CONFIRMED'))).toBeNull();
  });

  it('no-show from the first day; nobody cancels once it has changed hands', () => {
    const b = rental('CONFIRMED');
    expect(nextStatus('noShow', 'LENDER', b, at('2026-10-11T18:00:00Z'))).toBeNull();
    expect(nextStatus('noShow', 'LENDER', b, at('2026-10-11T18:30:00Z'))).toBe('CANCELLED');
    expect(nextStatus('noShow', 'BORROWER', b, at('2026-10-12T09:00:00Z'))).toBeNull();
    for (const s of ['ACTIVE', 'RETURNED', 'DISPUTED'] as const) {
      expect(nextStatus('cancel', 'ADMIN', rental(s))).toBeNull();
      expect(nextStatus('cancel', 'BORROWER', rental(s))).toBeNull();
    }
  });

  it('return, claim window, completion and disputes', () => {
    const returned = at('2026-10-14T12:00:00Z');
    expect(nextStatus('markReturned', 'BORROWER', rental('ACTIVE'))).toBe('RETURNED');
    expect(nextStatus('markReturned', 'LENDER', rental('ACTIVE'))).toBeNull();
    const r = rental('RETURNED', returned);
    expect(nextStatus('openDispute', 'LENDER', r, at('2026-10-15T11:59:00Z'))).toBe('DISPUTED');
    expect(nextStatus('openDispute', 'LENDER', r, at('2026-10-15T12:00:00Z'))).toBeNull();
    expect(nextStatus('openDispute', 'BORROWER', r, at('2026-10-14T13:00:00Z'))).toBeNull();
    expect(nextStatus('complete', 'SYSTEM', r)).toBe('COMPLETED');
    expect(nextStatus('complete', 'LENDER', r)).toBeNull();
    expect(nextStatus('resolveDispute', 'ADMIN', rental('DISPUTED'))).toBe('COMPLETED');
    expect(nextStatus('resolveDispute', 'LENDER', rental('DISPUTED'))).toBeNull();
    // Not returned: only once 2 days overdue.
    const out = rental('ACTIVE');
    expect(nextStatus('openDispute', 'LENDER', out, at('2026-10-16T18:00:00Z'))).toBeNull();
    expect(nextStatus('openDispute', 'LENDER', out, at('2026-10-16T18:30:00Z'))).toBe('DISPUTED');
  });

  it('the claim window is the returned booking’s deadline', () => {
    const w = { requestMin: 60, docsMin: 60, paymentMin: 60 };
    const now = at('2026-10-14T12:00:00Z');
    expect(deadlineFor({ ...rental('RETURNED'), startsOn: day('2026-10-12') }, now, w)).toEqual(
      at('2026-10-15T12:00:00Z'),
    );
    expect(deadlineFor({ ...rental('ACTIVE'), startsOn: day('2026-10-12') }, now, w)).toBeNull();
  });

  it('late days count started days; the fee is capped at the deposit', () => {
    const end = day('2026-10-14');
    expect(lateDaysFor(end, at('2026-10-14T18:29:00Z'))).toBe(0);
    expect(lateDaysFor(end, at('2026-10-14T18:31:00Z'))).toBe(1);
    expect(lateDaysFor(end, at('2026-10-15T18:30:00Z'))).toBe(1);
    expect(lateDaysFor(end, at('2026-10-15T18:31:00Z'))).toBe(2);
    expect(lateFeeFor(2, 15_000, 100_000)).toBe(30_000);
    expect(lateFeeFor(9, 15_000, 100_000)).toBe(100_000);
    expect(maxKeepable(100_000, 30_000)).toBe(70_000);
    expect(maxKeepable(100_000, 100_000)).toBe(0);
  });

  it('`can` flags during the rental', () => {
    const now = at('2026-10-12T09:00:00Z');
    expect(allowedActions('LENDER', rental('CONFIRMED'), now)).toMatchObject({
      handover: true,
      noShow: true,
      showCode: false,
      cancel: true,
    });
    expect(allowedActions('BORROWER', rental('CONFIRMED'), now)).toMatchObject({
      showCode: true,
      handover: false,
    });
    expect(allowedActions('BORROWER', rental('ACTIVE'), now)).toMatchObject({
      return: true,
      addPhotos: true,
      cancel: false,
    });
    expect(allowedActions('LENDER', rental('ACTIVE'), now)).toMatchObject({
      showCode: true,
      dispute: false,
    });
    const r = rental('RETURNED', at('2026-10-14T12:00:00Z'));
    expect(allowedActions('LENDER', r, at('2026-10-14T13:00:00Z'))).toMatchObject({
      dispute: true,
      addPhotos: true,
    });
    expect(allowedActions('LENDER', r, at('2026-10-16T13:00:00Z'))).toMatchObject({
      dispute: false,
      addPhotos: false,
    });
  });
});
