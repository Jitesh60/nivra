'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { attempt, unwrap, userApi } from '@/lib/api';

export interface Result {
  error?: string;
  success?: string;
}

const refresh = (id: string) => {
  revalidatePath(`/bookings/${id}`);
  revalidatePath('/bookings');
};

const MESSAGES: Record<string, string> = {
  BOOKING_DATES_TAKEN: 'Someone booked these dates first. Try other dates.',
  BOOKING_DATES_UNAVAILABLE: 'The item isn’t available on these dates.',
  BOOKING_OPEN_EXISTS: 'You already have an open request for this item.',
  BOOKING_OWN_LISTING: 'This is your own listing.',
  BOOKING_INVALID_TRANSITION: 'This booking has changed. Reload the page.',
  EMAIL_NOT_VERIFIED: 'Verify your email first (Profile → Email).',
};

async function act(id: string, run: () => Promise<unknown>, success?: string): Promise<Result> {
  const result = await attempt(run);
  if (!result.ok) return { error: MESSAGES[result.apiError.code] ?? result.error };
  refresh(id);
  return { success };
}

/** From the item page: dates → a booking request. */
export async function requestBookingAction(
  listingId: string,
  startDate: string,
  endDate: string,
): Promise<Result> {
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(api.POST('/v1/bookings', { body: { listingId, startDate, endDate } })),
  );
  if (!result.ok) return { error: MESSAGES[result.apiError.code] ?? result.error };
  revalidatePath('/bookings');
  redirect(`/bookings/${result.data.id}?requested=1`);
}

export async function acceptAction(id: string): Promise<Result> {
  const api = await userApi();
  return act(
    id,
    () => unwrap(api.POST('/v1/bookings/{id}/accept', { params: { path: { id } } })),
    'Accepted.',
  );
}

export async function declineAction(id: string, reason: string): Promise<Result> {
  const api = await userApi();
  return act(
    id,
    () =>
      unwrap(
        api.POST('/v1/bookings/{id}/decline', {
          params: { path: { id } },
          body: reason.trim() ? { reason: reason.trim() } : {},
        }),
      ),
    'Declined.',
  );
}

export async function cancelAction(id: string, reason: string): Promise<Result> {
  if (reason.trim().length < 3) return { error: 'Tell the other person why (a few words).' };
  const api = await userApi();
  return act(
    id,
    () =>
      unwrap(
        api.POST('/v1/bookings/{id}/cancel', {
          params: { path: { id } },
          body: { reason: reason.trim() },
        }),
      ),
    'Booking cancelled.',
  );
}

export async function shareDocumentsAction(
  id: string,
  shares: { requiredDocId: string; userDocumentId: string }[],
): Promise<Result> {
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(api.POST('/v1/bookings/{id}/documents', { params: { path: { id } }, body: { shares } })),
  );
  if (!result.ok) return { error: result.error };
  refresh(id);
  redirect(`/bookings/${id}?shared=1`);
}

export async function approveDocsAction(id: string): Promise<Result> {
  const api = await userApi();
  return act(
    id,
    () => unwrap(api.POST('/v1/bookings/{id}/documents/approve', { params: { path: { id } } })),
    'Documents approved. The borrower can pay now.',
  );
}

export async function rejectDocsAction(id: string, reason: string): Promise<Result> {
  if (reason.trim().length < 3) return { error: 'Say what’s wrong so they can fix it.' };
  const api = await userApi();
  return act(
    id,
    () =>
      unwrap(
        api.POST('/v1/bookings/{id}/documents/reject', {
          params: { path: { id } },
          body: { reason: reason.trim() },
        }),
      ),
    'Documents rejected. The borrower can share others.',
  );
}

// ── Payment ──

/** Opens a payment order for the booking total (when the borrower taps Pay). */
export async function createOrderAction(id: string) {
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(api.POST('/v1/bookings/{id}/pay', { params: { path: { id } } })),
  );
  return result.ok ? { order: result.data } : { error: result.error };
}

export async function verifyPaymentAction(
  id: string,
  payment: { orderId: string; paymentId: string; signature: string },
): Promise<Result> {
  const api = await userApi();
  const result = await attempt(() => unwrap(api.POST('/v1/payments/verify', { body: payment })));
  if (!result.ok) return { error: result.error };
  refresh(id);
  redirect(`/bookings/${id}?paid=1`);
}

/** Test servers only (PAYMENT_PROVIDER=fake): stands in for Razorpay's checkout. */
export async function fakeCheckoutAction(id: string, orderId: string): Promise<Result> {
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(
      api.POST('/v1/dev/payments/{orderId}/checkout', {
        params: { path: { orderId } },
        body: { outcome: 'success', webhook: 'never' },
      }),
    ),
  );
  if (!result.ok) return { error: result.error };
  const { paymentId, signature, error } = result.data;
  if (!paymentId || !signature) return { error: error ?? 'Test payment failed.' };
  return verifyPaymentAction(id, { orderId, paymentId, signature });
}
