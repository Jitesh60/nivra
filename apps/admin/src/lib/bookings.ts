import type { Schemas } from '@sajha/api-client';

export type AdminBooking = Schemas['AdminBookingDto'];
export type AdminBookingDetail = Schemas['AdminBookingDetailDto'];
export type BookingTab = 'OPEN' | 'AWAITING_PAYMENT' | 'CONFIRMED' | 'CLOSED';

export const BOOKING_TABS: BookingTab[] = ['OPEN', 'AWAITING_PAYMENT', 'CONFIRMED', 'CLOSED'];

export const BOOKING_TAB_LABEL: Record<BookingTab, string> = {
  OPEN: 'Open',
  AWAITING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Paid',
  CLOSED: 'Closed',
};

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Requested',
  AWAITING_DOCS: 'Waiting for documents',
  AWAITING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  ACTIVE: 'In progress',
  RETURNED: 'Returned',
  COMPLETED: 'Completed',
  DISPUTED: 'Disputed',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

export const BOOKING_EVENT_LABEL: Record<string, string> = {
  REQUESTED: 'Requested',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  DOCS_SUBMITTED: 'Documents shared',
  DOCS_APPROVED: 'Documents approved',
  DOCS_REJECTED: 'Documents not accepted',
  PAID: 'Paid (confirmed)',
};

export const PARTY_LABEL: Record<string, string> = {
  BORROWER: 'Borrower',
  LENDER: 'Lender',
  ADMIN: 'Sajha',
  SYSTEM: 'System',
};

export const REQUIRED_DOC_LABEL: Record<string, string> = {
  GOVERNMENT_ID: 'Government ID',
  COLLEGE_OR_EMPLOYEE_ID: 'College or employee ID',
  ADDRESS_PROOF: 'Address proof',
  OTHER: 'Other',
};

export const COMMON_CANCEL_REASONS = [
  'Reported as a scam',
  'Asked to pay outside Sajha',
  'Requested by the borrower (support ticket)',
  'Requested by the lender (support ticket)',
];

const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "12 Oct – 14 Oct" (booking dates are whole days). */
export function bookingDates(b: { startDate: string; endDate: string }): string {
  const s = day.format(new Date(`${b.startDate}T00:00:00Z`));
  const e = day.format(new Date(`${b.endDate}T00:00:00Z`));
  return s === e ? s : `${s} – ${e}`;
}

/** "#4F2A9C", as the apps show it. */
export function bookingRef(id: string): string {
  return `#${id.replace(/-/g, '').slice(-6).toUpperCase()}`;
}
