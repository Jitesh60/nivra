'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';
import { toPaise } from '@/lib/payments';

export interface ResolveDisputeState {
  error?: string;
}

/** Settles a dispute: the lender keeps [kept] of the deposit, the rest goes back. */
export async function resolveDisputeAction(
  _: ResolveDisputeState,
  form: FormData,
): Promise<ResolveDisputeState> {
  const id = String(form.get('id'));
  const note = String(form.get('note') ?? '').trim();
  const keptPaise = toPaise(String(form.get('kept') ?? ''));
  if (keptPaise === null) return { error: 'Enter an amount in rupees (0 to return it all).' };
  if (note.length < 3) return { error: 'Add a note. Both people see it.' };
  try {
    await unwrap(
      (await adminApi()).POST('/v1/admin/disputes/{id}/resolve', {
        params: { path: { id } },
        body: { keptPaise, note },
      }),
    );
  } catch (err) {
    if (err instanceof ApiRequestError) return { error: err.message };
    throw err;
  }
  revalidatePath('/disputes', 'layout');
  revalidatePath('/bookings', 'layout');
  return {};
}
