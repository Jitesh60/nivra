'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';

export interface CancelBookingState {
  error?: string;
  done?: string;
}

export async function cancelBookingAction(
  _: CancelBookingState,
  form: FormData,
): Promise<CancelBookingState> {
  const id = String(form.get('id'));
  const reason = String(form.get('reason') ?? '').trim();
  if (reason.length < 3) return { error: 'Give a reason. Both people will see it.' };
  try {
    await unwrap(
      (await adminApi()).POST('/v1/admin/bookings/{id}/cancel', {
        params: { path: { id } },
        body: { reason },
      }),
    );
  } catch (err) {
    if (err instanceof ApiRequestError) return { error: err.message };
    throw err;
  }
  revalidatePath('/bookings', 'layout');
  return { done: 'Booking cancelled. Both people were told.' };
}
