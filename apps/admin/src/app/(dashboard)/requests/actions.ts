'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';

export interface RequestActionState {
  error?: string;
  done?: string;
}

export async function removeRequestAction(
  _: RequestActionState,
  form: FormData,
): Promise<RequestActionState> {
  const id = String(form.get('id'));
  const reason = String(form.get('reason') ?? '').trim();
  if (reason.length < 3) return { error: 'Tell the borrower why it was taken down.' };
  try {
    await unwrap(
      (await adminApi()).POST('/v1/admin/requests/{id}/remove', {
        params: { path: { id } },
        body: { reason },
      }),
    );
  } catch (err) {
    if (err instanceof ApiRequestError) return { error: err.message };
    throw err;
  }
  revalidatePath('/requests', 'layout');
  revalidatePath(`/requests/${id}`);
  return { done: 'Removed. The request is off the board and the borrower has been told why.' };
}
