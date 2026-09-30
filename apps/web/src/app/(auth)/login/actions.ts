'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { publicApi } from '@/lib/api';
import { friendlyMessage, toApiError } from '@/lib/errors';
import { safeNext } from '@/lib/safe-next';
import { COOKIE, cookieOptions, deviceId, saveSession } from '@/lib/session';

export interface FormState {
  error?: string;
  sent?: number;
}

/** What /login/verify needs, kept in an httpOnly cookie for 10 minutes. */
export interface Challenge {
  id: string;
  phone: string;
  resendAt: number;
}

const CHALLENGE_MAX_AGE_SEC = 10 * 60;
const NETWORK = { error: { code: 'NETWORK', message: '' } };

/** Keeps the 10 digits of an Indian mobile number (drops +91, spaces, dashes). */
function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

async function sendCode(phone: string): Promise<{ error?: string }> {
  const { data, error } = await (
    await publicApi()
  )
    .POST('/v1/auth/otp/request', { body: { phone } })
    .catch(() => ({ data: undefined, error: NETWORK }));
  if (!data) return { error: friendlyMessage(toApiError(error)) };
  const challenge: Challenge = {
    id: data.challengeId,
    phone,
    resendAt: Date.now() + data.resendAfterSec * 1000,
  };
  (await cookies()).set(
    COOKIE.challenge,
    JSON.stringify(challenge),
    cookieOptions(CHALLENGE_MAX_AGE_SEC),
  );
  return {};
}

/** Step 1: phone number → SMS code. */
export async function requestCodeAction(_: FormState, form: FormData): Promise<FormState> {
  const phone = normalisePhone(String(form.get('phone') ?? ''));
  if (!phone) return { error: 'Enter a 10-digit Indian mobile number.' };
  const { error } = await sendCode(phone);
  if (error) return { error };
  redirect(`/login/verify?next=${encodeURIComponent(safeNext(form.get('next')))}`);
}

export async function readChallenge(): Promise<Challenge | null> {
  const raw = (await cookies()).get(COOKIE.challenge)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Challenge;
  } catch {
    return null;
  }
}

/** Sends a fresh code to the same number. */
export async function resendCodeAction(): Promise<FormState> {
  const challenge = await readChallenge();
  if (!challenge) return { error: 'Your sign-in expired. Please start again.' };
  const { error } = await sendCode(challenge.phone);
  return error ? { error } : { sent: Date.now() };
}

/** Step 2: code → session cookies, then name/email setup or where they were going. */
export async function verifyCodeAction(_: FormState, form: FormData): Promise<FormState> {
  const challenge = await readChallenge();
  if (!challenge) return { error: 'Your sign-in expired. Please start again.' };
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { error: 'Enter the 6-digit code.' };

  const userAgent = (await headers()).get('user-agent') ?? '';
  const { data, error } = await (
    await publicApi()
  )
    .POST('/v1/auth/otp/verify', {
      body: {
        challengeId: challenge.id,
        code,
        deviceId: await deviceId(),
        deviceName: browserName(userAgent),
      },
    })
    .catch(() => ({ data: undefined, error: NETWORK }));
  if (!data) return { error: friendlyMessage(toApiError(error)) };

  await saveSession(data);
  const next = safeNext(form.get('next'));
  if (!data.user.name) redirect(`/welcome?next=${encodeURIComponent(next)}`);
  if (!data.user.emailVerified) redirect(`/welcome/email?next=${encodeURIComponent(next)}`);
  redirect(next);
}

/** "Chrome on Android": shown in Settings → Devices. */
function browserName(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return `${browser}${os ? ` on ${os}` : ''} (web)`;
}
