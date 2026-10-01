'use server';

import { revalidatePath } from 'next/cache';
import { attempt, unwrap, userApi } from '@/lib/api';
import { fieldErrors } from '@/lib/errors';

export interface FormState {
  error?: string;
  success?: string;
  fields?: Record<string, string>;
}

const FIELDS = [
  'beneficiaryName',
  'accountNumber',
  'ifsc',
  'pan',
  'email',
  'street',
  'city',
  'state',
  'postalCode',
] as const;

/** Bank account for payouts (set once, then verified by Razorpay). */
export async function savePayoutAccountAction(_: FormState, form: FormData): Promise<FormState> {
  const body = Object.fromEntries(
    FIELDS.map((f) => [f, String(form.get(f) ?? '').trim()]),
  ) as Record<(typeof FIELDS)[number], string>;
  body.ifsc = body.ifsc.toUpperCase();
  body.pan = body.pan.toUpperCase();
  if (String(form.get('accountNumber')) !== String(form.get('accountNumber2'))) {
    return { fields: { accountNumber2: 'The account numbers don’t match.' } };
  }
  const result = await attempt(async () =>
    unwrap((await userApi()).PUT('/v1/me/payout-account', { body })),
  );
  if (!result.ok) return { error: result.error, fields: fieldErrors(result.apiError) };
  revalidatePath('/earnings');
  return { success: 'Saved. We’ll verify it with your bank.' };
}
