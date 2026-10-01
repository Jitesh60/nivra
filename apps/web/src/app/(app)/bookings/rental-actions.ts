'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { attempt, unwrap, userApi } from '@/lib/api';
import { formFiles, uploadImage } from '@/lib/upload';

export interface Result {
  error?: string;
  success?: string;
}

const MESSAGES: Record<string, string> = {
  BOOKING_CODE_INVALID: 'That code isn’t right. Check the 6 digits on their screen.',
  BOOKING_CODE_LOCKED: 'Too many wrong codes. Try again in a few minutes.',
  HANDOVER_TOO_EARLY: 'The handover opens the day before the rental starts.',
  PHOTOS_REQUIRED: 'Add at least 2 photos of the item’s condition.',
  DISPUTE_WINDOW_CLOSED: 'The time to raise a problem has passed.',
  BOOKING_INVALID_TRANSITION: 'This booking has moved on. Reload the page.',
};

async function uploadAll(form: FormData, field: string): Promise<string[]> {
  const keys: string[] = [];
  for (const file of formFiles(form, field)) keys.push(await uploadImage(file, 'CONDITION_PHOTO'));
  return keys;
}

const fail = (r: {
  apiError: { code: string; details?: Record<string, unknown> };
  error: string;
}) => {
  if (r.apiError.code === 'BOOKING_CODE_INVALID' && r.apiError.details?.triesLeft !== undefined) {
    return {
      error: `${MESSAGES.BOOKING_CODE_INVALID} ${String(r.apiError.details.triesLeft)} tries left.`,
    };
  }
  return { error: MESSAGES[r.apiError.code] ?? r.error };
};

/** Lender (handover) or borrower (return): the other person's code + condition photos. */
export async function confirmStageAction(
  id: string,
  stage: 'handover' | 'return',
  form: FormData,
): Promise<Result> {
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { error: 'Enter the 6-digit code.' };
  const count = formFiles(form, 'photos').length;
  if (count < 2 || count > 6) return { error: 'Add 2 to 6 photos of the item’s condition.' };
  const note = String(form.get('note') ?? '').trim() || undefined;
  const result = await attempt(async () => {
    const photoKeys = await uploadAll(form, 'photos');
    const api = await userApi();
    const body = { code, photoKeys, note };
    const params = { path: { id } };
    return unwrap(
      stage === 'handover'
        ? api.POST('/v1/bookings/{id}/handover', { params, body })
        : api.POST('/v1/bookings/{id}/return', { params, body }),
    );
  });
  if (!result.ok) return fail(result);
  revalidatePath(`/bookings/${id}`);
  redirect(`/bookings/${id}?${stage === 'handover' ? 'handedover' : 'returned'}=1`);
}

export async function noShowAction(id: string, reason: string): Promise<Result> {
  const result = await attempt(async () =>
    unwrap(
      (await userApi()).POST('/v1/bookings/{id}/no-show', {
        params: { path: { id } },
        body: reason.trim() ? { reason: reason.trim() } : {},
      }),
    ),
  );
  if (!result.ok) return fail(result);
  revalidatePath(`/bookings/${id}`);
  return { success: 'Reported. Our team will sort out the refund.' };
}

export async function openDisputeAction(id: string, form: FormData): Promise<Result> {
  const reason = String(form.get('reason') ?? '') as
    'DAMAGE' | 'MISSING_PARTS' | 'NOT_RETURNED' | 'OTHER';
  const description = String(form.get('description') ?? '').trim();
  const claimPaise = Math.round(Number(form.get('claim') ?? 0) * 100);
  if (description.length < 10) return { error: 'Describe what happened (at least a sentence).' };
  if (!(claimPaise > 0)) return { error: 'Enter the amount you’re claiming.' };
  const result = await attempt(async () => {
    const photoKeys = await uploadAll(form, 'photos');
    return unwrap(
      (await userApi()).POST('/v1/bookings/{id}/dispute', {
        params: { path: { id } },
        body: { reason, description, claimPaise, photoKeys },
      }),
    );
  });
  if (!result.ok) return fail(result);
  revalidatePath(`/bookings/${id}`);
  redirect(`/bookings/${id}?disputed=1`);
}

export async function respondDisputeAction(id: string, form: FormData): Promise<Result> {
  const note = String(form.get('note') ?? '').trim();
  if (note.length < 10) return { error: 'Give your side (at least a sentence).' };
  const result = await attempt(async () => {
    const photoKeys = await uploadAll(form, 'photos');
    return unwrap(
      (await userApi()).POST('/v1/bookings/{id}/dispute/response', {
        params: { path: { id } },
        body: { note, photoKeys },
      }),
    );
  });
  if (!result.ok) return fail(result);
  revalidatePath(`/bookings/${id}`);
  redirect(`/bookings/${id}?responded=1`);
}

export async function reviewAction(id: string, rating: number, comment: string): Promise<Result> {
  if (!(rating >= 1 && rating <= 5)) return { error: 'Choose 1 to 5 stars.' };
  const result = await attempt(async () =>
    unwrap(
      (await userApi()).POST('/v1/bookings/{id}/review', {
        params: { path: { id } },
        body: { rating, comment: comment.trim() || undefined },
      }),
    ),
  );
  if (!result.ok) return fail(result);
  revalidatePath(`/bookings/${id}`);
  redirect(`/bookings/${id}?reviewed=1`);
}
