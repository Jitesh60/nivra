'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { attempt, unwrap, userApi } from '@/lib/api';
import { fieldErrors } from '@/lib/errors';
import { safeNext } from '@/lib/safe-next';
import { cookieOptions } from '@/lib/session';

export interface FormState {
  error?: string;
  fields?: Record<string, string>;
  /** Set once an email code is on its way. */
  email?: string;
  sent?: number;
}

const EMAIL_CHALLENGE = 'nivra_eotp';

/** Step 3: name (and optional city) for a new account. */
export async function saveNameAction(_: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get('name') ?? '').trim();
  const city = String(form.get('city') ?? '').trim();
  if (name.length < 2) return { fields: { name: 'Enter your name.' } };
  const api = await userApi();
  const result = await attempt(() => unwrap(api.PATCH('/v1/me', { body: { name, city } })));
  if (!result.ok) return { error: result.error, fields: fieldErrors(result.apiError) };
  const next = safeNext(form.get('next'));
  redirect(
    result.data.user.emailVerified ? next : `/welcome/email?next=${encodeURIComponent(next)}`,
  );
}

/** Step 4a: email → 6-digit code by email. */
export async function requestEmailCodeAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get('email') ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { fields: { email: 'Enter a valid email address.' } };
  }
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(api.POST('/v1/auth/email/otp/request', { body: { email } })),
  );
  if (!result.ok) return { error: result.error, fields: fieldErrors(result.apiError) };
  (await cookies()).set(EMAIL_CHALLENGE, result.data.challengeId, cookieOptions(15 * 60));
  return { email, sent: Date.now() };
}

/** Step 4b: code → email verified. */
export async function verifyEmailCodeAction(prev: FormState, form: FormData): Promise<FormState> {
  const challengeId = (await cookies()).get(EMAIL_CHALLENGE)?.value;
  if (!challengeId) return { ...prev, error: 'The code expired. Send a new one.' };
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { ...prev, error: 'Enter the 6-digit code.' };
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(api.POST('/v1/auth/email/otp/verify', { body: { challengeId, code } })),
  );
  if (!result.ok) return { ...prev, error: result.error };
  (await cookies()).delete(EMAIL_CHALLENGE);
  redirect(safeNext(form.get('next')));
}
