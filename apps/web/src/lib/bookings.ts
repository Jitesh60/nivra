import 'server-only';
import type { Schemas } from '@sajha/api-client';
import { unwrap, userApi } from './api';

export type Booking = Schemas['BookingDetailDto'];
export type BookingSummary = Schemas['BookingDto'];
export type BookingStatus = Booking['status'];
export type UserDocument = Schemas['DocumentDto'];
export type Earnings = Schemas['EarningsDto'];
export type PayoutAccount = Schemas['PayoutAccountDto'];

export async function getBookings(
  role: 'BORROWER' | 'LENDER',
  scope: 'OPEN' | 'PAST',
  cursor?: string,
) {
  return unwrap(
    (await userApi()).GET('/v1/bookings', {
      params: { query: { role, scope, cursor, limit: 20 } },
    }),
  );
}

/** A booking the user is part of, or null. */
export async function getBooking(id: string): Promise<Booking | null> {
  const result = await (await userApi()).GET('/v1/bookings/{id}', { params: { path: { id } } });
  if ([400, 403, 404].includes(result.response.status)) return null;
  return unwrap(Promise.resolve(result));
}

export async function getCancelPreview(id: string) {
  return unwrap(
    (await userApi()).GET('/v1/bookings/{id}/cancel-preview', { params: { path: { id } } }),
  );
}

export async function getDocuments(): Promise<UserDocument[]> {
  return unwrap((await userApi()).GET('/v1/me/documents'));
}

export async function getEarnings(): Promise<Earnings> {
  return unwrap((await userApi()).GET('/v1/me/earnings'));
}

/** What each status means, from the user's side. */
export const STATUS_TEXT: Record<
  BookingStatus,
  {
    label: string;
    tone: 'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'brand';
    borrower: string;
    lender: string;
  }
> = {
  REQUESTED: {
    label: 'Requested',
    tone: 'info',
    borrower: 'Waiting for the lender to accept.',
    lender: 'Accept or decline this request.',
  },
  AWAITING_DOCS: {
    label: 'Documents needed',
    tone: 'warning',
    borrower: 'Share the documents the lender asked for.',
    lender: 'Waiting for the borrower’s documents, then you approve them.',
  },
  AWAITING_PAYMENT: {
    label: 'Awaiting payment',
    tone: 'warning',
    borrower: 'Pay to confirm your booking.',
    lender: 'Waiting for the borrower to pay.',
  },
  CONFIRMED: {
    label: 'Confirmed',
    tone: 'success',
    borrower: 'Booked. Meet the lender at the pickup point on the first day.',
    lender: 'Booked and paid. Hand the item over on the first day.',
  },
  ACTIVE: {
    label: 'With borrower',
    tone: 'brand',
    borrower: 'Enjoy it, and return it by the last day.',
    lender: 'The borrower has the item.',
  },
  RETURNED: {
    label: 'Returned',
    tone: 'success',
    borrower: 'Returned. Your deposit is on its way back.',
    lender: 'Returned. Your earnings are being released.',
  },
  COMPLETED: { label: 'Completed', tone: 'success', borrower: 'All done.', lender: 'All done.' },
  DISPUTED: {
    label: 'In dispute',
    tone: 'danger',
    borrower: 'Our team is looking into a problem with this rental.',
    lender: 'Our team is looking into a problem with this rental.',
  },
  DECLINED: {
    label: 'Declined',
    tone: 'neutral',
    borrower: 'The lender declined.',
    lender: 'You declined.',
  },
  EXPIRED: {
    label: 'Expired',
    tone: 'neutral',
    borrower: 'This request expired.',
    lender: 'This request expired.',
  },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', borrower: 'Cancelled.', lender: 'Cancelled.' },
};

export const EVENT_TEXT: Record<string, string> = {
  REQUESTED: 'Requested',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  DOCS_SUBMITTED: 'Documents shared',
  DOCS_APPROVED: 'Documents approved',
  DOCS_REJECTED: 'Documents rejected',
  PAID: 'Paid',
  HANDED_OVER: 'Handed over',
  RETURNED: 'Returned',
  NO_SHOW: 'No-show reported',
  DISPUTED: 'Dispute opened',
  COMPLETED: 'Completed',
  DISPUTE_RESOLVED: 'Dispute resolved',
};

export const USER_DOC_LABEL: Record<string, string> = {
  AADHAAR_MASKED: 'Aadhaar (masked)',
  PAN: 'PAN card',
  DRIVING_LICENCE: 'Driving licence',
  PASSPORT: 'Passport',
  VOTER_ID: 'Voter ID',
  COLLEGE_ID: 'College ID',
  EMPLOYEE_ID: 'Employee ID',
  ADDRESS_PROOF: 'Address proof',
  OTHER: 'Other document',
};
