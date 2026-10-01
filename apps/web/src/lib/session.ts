import 'server-only';
import { cookies } from 'next/headers';

/**
 * Signed-in web users: API tokens live only in httpOnly cookies, so browser
 * JavaScript never sees them. Every API call is made from the Next.js server.
 * Names are mirrored in src/proxy.ts (the proxy can't import server-only code).
 */
export const COOKIE = {
  access: 'nivra_at',
  refresh: 'nivra_rt',
  /** Stable per-browser id: the API ties the session to it, like an app install. */
  device: 'nivra_did',
  /** The phone OTP challenge between /login and /login/verify. */
  challenge: 'nivra_otp',
} as const;

/** User sessions last 30 days on the API; the refresh cookie matches. */
export const REFRESH_MAX_AGE_SEC = 30 * 24 * 60 * 60;
const DEVICE_MAX_AGE_SEC = 5 * 365 * 24 * 60 * 60;

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // lax (not strict) so links from emails and chats open signed in.
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE.access)?.value;
}

export async function hasSession(): Promise<boolean> {
  return Boolean((await cookies()).get(COOKIE.refresh)?.value);
}

/** Server Functions / Route Handlers only (cookies can't be set while rendering). */
export async function saveSession(tokens: SessionTokens): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE.access, tokens.accessToken, cookieOptions(tokens.expiresInSec));
  jar.set(COOKIE.refresh, tokens.refreshToken, cookieOptions(REFRESH_MAX_AGE_SEC));
  jar.delete(COOKIE.challenge);
}

/** The browser's device id, created on first sign-in. */
export async function deviceId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE.device)?.value;
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  jar.set(COOKIE.device, id, cookieOptions(DEVICE_MAX_AGE_SEC));
  return id;
}

/** Signs out locally. The device id stays, so the next sign-in reuses it. */
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE.access);
  jar.delete(COOKIE.refresh);
  jar.delete(COOKIE.challenge);
}
