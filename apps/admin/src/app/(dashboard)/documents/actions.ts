'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';

export interface ReviewState {
  error?: string;
}

export async function approveDocumentAction(_: ReviewState, form: FormData): Promise<ReviewState> {
  const id = String(form.get('id'));
  try {
    await unwrap(
      (await adminApi()).POST('/v1/admin/documents/{id}/approve', { params: { path: { id } } }),
    );
  } catch (err) {
    if (err instanceof ApiRequestError) return { error: err.message };
    throw err;
  }
  revalidatePath('/documents', 'layout');
  return {};
}

export async function rejectDocumentAction(_: ReviewState, form: FormData): Promise<ReviewState> {
  const id = String(form.get('id'));
  const reason = String(form.get('reason') ?? '').trim();
  if (reason.length < 3) return { error: 'Tell the user what to fix.' };
  try {
    await unwrap(
      (await adminApi()).POST('/v1/admin/documents/{id}/reject', {
        params: { path: { id } },
        body: { reason },
      }),
    );
  } catch (err) {
    if (err instanceof ApiRequestError) return { error: err.message };
    throw err;
  }
  revalidatePath('/documents', 'layout');
  return {};
}
