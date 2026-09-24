'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';
import { rupees } from '@/lib/listings';
import { toPaise } from '@/lib/payments';

export interface RefundState {
  error?: string;
  done?: string;
}

/** A goodwill refund of part or all of what's left. */
export async function refundAction(_: RefundState, form: FormData): Promise<RefundState> {
  const id = String(form.get('id'));
  const reason = String(form.get('reason') ?? '').trim();
  const amountPaise = toPaise(String(form.get('amount') ?? ''));
  if (amountPaise === null || amountPaise < 100) {
    return { error: 'Enter an amount in rupees, at least ₹1.' };
  }
  if (reason.length < 3) return { error: 'Give a reason. It’s kept in the audit log.' };
  try {
    await unwrap(
      (await adminApi()).POST('/v1/admin/payments/{id}/refund', {
        params: { path: { id } },
        body: { amountPaise, reason },
      }),
    );
  } catch (err) {
    if (err instanceof ApiRequestError) return { error: err.message };
    throw err;
  }
  revalidatePath('/payments', 'layout');
  return { done: `Refund of ${rupees(amountPaise)} sent to Razorpay. The borrower was told.` };
}

export interface RetryState {
  error?: string;
  done?: string;
}

/** Tries a failed transfer to a lender again. */
export async function retryTransferAction(_: RetryState, form: FormData): Promise<RetryState> {
  const id = String(form.get('id'));
  try {
    const t = await unwrap(
      (await adminApi()).POST('/v1/admin/transfers/{id}/retry', { params: { path: { id } } }),
    );
    revalidatePath('/payments', 'layout');
    return {
      done: t.status === 'FAILED' ? `Failed again: ${t.failureReason ?? 'unknown'}` : 'Sent.',
    };
  } catch (err) {
    if (err instanceof ApiRequestError) return { error: err.message };
    throw err;
  }
}
