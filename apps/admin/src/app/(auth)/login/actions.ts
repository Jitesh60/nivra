'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { publicApi } from '@/lib/api';
import { friendlyMessage, toApiError } from '@/lib/errors';
import { COOKIE, cookieOptions, saveSession } from '@/lib/session';

export interface FormState {
  error?: string;
}

const MFA_MAX_AGE_SEC = 5 * 60;

/** Only same-site paths, never `//evil.com` or absolute URLs. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === 'string' ? value : '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

async function fail(body: unknown): Promise<FormState> {
  return { error: friendlyMessage(toApiError(body)) };
}

/** Step 1: email + password → 2FA token (kept in an httpOnly cookie). */
export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const { data, error } = await publicApi()
    .POST('/v1/admin/auth/login', {
      body: {
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      },
    })
    .catch(() => ({ data: undefined, error: { error: { code: 'NETWORK', message: '' } } }));
  if (!data) return fail(error);

  (await cookies()).set(COOKIE.mfa, data.mfaToken, cookieOptions(MFA_MAX_AGE_SEC));
  const next = encodeURIComponent(safeNext(form.get('next')));
  redirect(data.mfaSetupRequired ? `/login/setup?next=${next}` : `/login/verify?next=${next}`);
}

export interface SetupResult {
  qrDataUrl?: string;
  secret?: string;
  error?: string;
}

/**
 * First login: asks the API for a new authenticator secret. Called once from
 * the client when the setup page opens (each call replaces the secret).
 */
export async function startSetupAction(): Promise<SetupResult> {
  const mfaToken = (await cookies()).get(COOKIE.mfa)?.value;
  if (!mfaToken) return { error: 'Your sign-in expired. Please start again.' };
  const { data, error } = await publicApi()
    .POST('/v1/admin/auth/2fa/setup', { body: { mfaToken } })
    .catch(() => ({ data: undefined, error: undefined }));
  if (!data) return { error: friendlyMessage(toApiError(error)) };
  const secret = new URL(data.otpauthUrl).searchParams.get('secret') ?? undefined;
  return { qrDataUrl: data.qrDataUrl, secret };
}

/** Step 2: authenticator code or recovery code → session cookies. */
export async function verifyAction(_: FormState, form: FormData): Promise<FormState> {
  const jar = await cookies();
  const mfaToken = jar.get(COOKIE.mfa)?.value;
  if (!mfaToken) return { error: 'Your sign-in expired. Please start again.' };

  const code = String(form.get('code') ?? '').replace(/\s/g, '');
  const recoveryCode = String(form.get('recoveryCode') ?? '').trim();
  const { data, error } = await publicApi()
    .POST('/v1/admin/auth/2fa/verify', {
      body: recoveryCode ? { mfaToken, recoveryCode } : { mfaToken, code },
    })
    .catch(() => ({ data: undefined, error: { error: { code: 'NETWORK', message: '' } } }));
  if (!data) return fail(error);

  await saveSession(data);
  const next = safeNext(form.get('next'));
  if (data.recoveryCodes?.length) {
    jar.set(COOKIE.recovery, JSON.stringify(data.recoveryCodes), cookieOptions(10 * 60));
    redirect(`/login/recovery-codes?next=${encodeURIComponent(next)}`);
  }
  redirect(data.admin.mustChangePassword ? '/account/password' : next);
}

/** Leaves the recovery-codes page; the codes are never shown again. */
export async function recoveryCodesSavedAction(form: FormData): Promise<void> {
  (await cookies()).delete(COOKIE.recovery);
  redirect(safeNext(form.get('next')));
}
