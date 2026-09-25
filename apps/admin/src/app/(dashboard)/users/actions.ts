'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';

export type UserAction = 'suspend' | 'ban' | 'reactivate';

export interface UserActionState {
  error?: string;
  done?: UserAction;
}

const PATHS = {
  suspend: '/v1/admin/users/{id}/suspend',
  ban: '/v1/admin/users/{id}/ban',
  reactivate: '/v1/admin/users/{id}/reactivate',
} as const;

export async function userStatusAction(
  _: UserActionState,
  form: FormData,
): Promise<UserActionState> {
  const id = String(form.get('id'));
  const action = String(form.get('action')) as UserAction;
  const reason = String(form.get('reason') ?? '').trim();
  if (!(action in PATHS)) return { error: 'Unknown action.' };
  if (reason.length < 3) return { error: 'Add a reason. It goes in the audit log.' };
  try {
    await unwrap(
      (await adminApi()).POST(PATHS[action], { params: { path: { id } }, body: { reason } }),
    );
  } catch (err) {
    if (err instanceof ApiRequestError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/users/${id}`);
  revalidatePath('/users');
  return { done: action };
}

export interface CreditActionState {
  error?: string;
  done?: string;
}

/** Take away unused invite credit (amount in rupees in the form, sent as paise). */
export async function revokeCreditAction(
  _: CreditActionState,
  form: FormData,
): Promise<CreditActionState> {
  const id = String(form.get('id'));
  const rupees = Number(form.get('amount'));
  const reason = String(form.get('reason') ?? '').trim();
  if (!Number.isFinite(rupees) || rupees < 1) return { error: 'Enter an amount of at least ₹1.' };
  if (reason.length < 3) return { error: 'Add a reason. It goes in the audit log.' };
  try {
    await unwrap(
      (await adminApi()).POST('/v1/admin/users/{id}/credits/revoke', {
        params: { path: { id } },
        body: { amountPaise: Math.round(rupees * 100), reason },
      }),
    );
  } catch (err) {
    if (err instanceof ApiRequestError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/users/${id}`);
  return { done: `Took ₹${rupees.toLocaleString('en-IN')} of credit away.` };
}
