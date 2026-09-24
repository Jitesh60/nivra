import 'server-only';
import { cookies } from 'next/headers';

/**
 * Admin tokens live only in httpOnly cookies, so browser JavaScript can never
 * read them. The API is always called from the Next.js server.
 */
export const COOKIE = {
  access: 'sajha_admin_at',
  refresh: 'sajha_admin_rt',
  /** Short-lived token between the password step and the 2FA step. */
  mfa: 'sajha_admin_mfa',
  /** Recovery codes, held for one page view right after 2FA is enabled. */
  recovery: 'sajha_admin_rc',
} as const;

/** Admin sessions last 12 hours on the API; the refresh cookie matches. */
export const REFRESH_MAX_AGE_SEC = 12 * 60 * 60;

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
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

/** Server Functions / Route Handlers only (cookies can't be set while rendering). */
export async function saveSession(tokens: SessionTokens): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE.access, tokens.accessToken, cookieOptions(tokens.expiresInSec));
  jar.set(COOKIE.refresh, tokens.refreshToken, cookieOptions(REFRESH_MAX_AGE_SEC));
  jar.delete(COOKIE.mfa);
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  for (const name of Object.values(COOKIE)) jar.delete(name);
}
