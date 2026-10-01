import { NextResponse, type NextRequest } from 'next/server';

// Kept in sync with src/lib/session.ts (the proxy can't import server-only modules).
const ACCESS = 'nivra_at';
const REFRESH = 'nivra_rt';
const REFRESH_MAX_AGE_SEC = 30 * 24 * 60 * 60;
const API_URL = (
  process.env.SAJHA_API_URL ??
  process.env.NEXT_PUBLIC_SAJHA_API_URL ??
  'http://localhost:3000'
).replace(/\/$/, '');

/** Pages that need a signed-in user. */
const PRIVATE = [
  '/welcome',
  '/profile',
  '/wishlist',
  '/listings',
  '/bookings',
  '/documents',
  '/inbox',
  '/notifications',
  '/earnings',
  '/requests',
  '/saved-searches',
  '/invite',
  '/settings',
];

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});

const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Runs before app pages (see `config.matcher`; marketing pages skip it):
 * - private page, no session → /login?next=… (back here after signing in)
 * - access cookie expired but refresh cookie present → refresh with the API,
 *   rotate both cookies, and let the request continue (browse pages too, so
 *   a returning user still sees their wishlist hearts)
 * - signed in and on /login → where they were going
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const access = request.cookies.get(ACCESS)?.value;
  const refresh = request.cookies.get(REFRESH)?.value;
  const isPrivate = PRIVATE.some((p) => under(pathname, p));

  if (under(pathname, '/login')) {
    if (!refresh) return NextResponse.next();
    const next = request.nextUrl.searchParams.get('next');
    const target = next?.startsWith('/') && !next.startsWith('//') ? next : '/explore';
    return NextResponse.redirect(new URL(target, request.url));
  }

  if (!refresh) {
    if (!isPrivate) return NextResponse.next();
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (access) return NextResponse.next();

  const tokens = await refreshTokens(refresh, visitorHeaders(request));
  if (!tokens) {
    if (!isPrivate) {
      const response = NextResponse.next();
      response.cookies.delete(REFRESH);
      return response;
    }
    return NextResponse.redirect(new URL('/logout?reason=expired', request.url));
  }

  // Make the new access token visible to this request's server components…
  request.cookies.set(ACCESS, tokens.accessToken);
  request.cookies.set(REFRESH, tokens.refreshToken);
  const response = NextResponse.next({ request: { headers: request.headers } });
  // …and store the rotated pair in the browser.
  response.cookies.set(ACCESS, tokens.accessToken, cookieOptions(tokens.expiresInSec));
  response.cookies.set(REFRESH, tokens.refreshToken, cookieOptions(REFRESH_MAX_AGE_SEC));
  return response;
}

type Tokens = { accessToken: string; refreshToken: string; expiresInSec: number };

/**
 * Refresh tokens are single-use: the API revokes the session if one comes
 * back twice. When the access cookie expires, the page and its prefetches hit
 * this proxy at once, all carrying the same refresh token. So concurrent
 * refreshes share one call, and the result is kept for a few seconds for
 * requests that were already on their way with the old token.
 */
const REUSE_WINDOW_MS = 15_000;
const refreshes = new Map<string, { at: number; result: Promise<Tokens | null> }>();

/** The visitor's IP and browser, for the API (see src/lib/api.ts). */
function visitorHeaders(request: NextRequest): Record<string, string> {
  const secret = process.env.WEB_CLIENT_SECRET;
  if (!secret) return {};
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '';
  const forwarded: Record<string, string> = { 'x-nivra-web-key': secret };
  if (ip) forwarded['x-nivra-client-ip'] = ip;
  const ua = request.headers.get('user-agent');
  if (ua) forwarded['x-nivra-client-ua'] = ua.slice(0, 512);
  return forwarded;
}

function refreshTokens(
  refreshToken: string,
  extraHeaders: Record<string, string>,
): Promise<Tokens | null> {
  const now = Date.now();
  for (const [token, entry] of refreshes) {
    if (now - entry.at > REUSE_WINDOW_MS) refreshes.delete(token);
  }
  const existing = refreshes.get(refreshToken);
  if (existing) return existing.result;
  const result = callRefresh(refreshToken, extraHeaders);
  refreshes.set(refreshToken, { at: now, result });
  return result;
}

async function callRefresh(
  refreshToken: string,
  extraHeaders: Record<string, string>,
): Promise<Tokens | null> {
  try {
    const res = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...extraHeaders },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as Tokens;
  } catch {
    return null;
  }
}

export const config = {
  matcher: [
    '/login/:path*',
    '/explore/:path*',
    '/item/:path*',
    '/u/:path*',
    '/session',
    '/welcome/:path*',
    '/profile/:path*',
    '/wishlist/:path*',
    '/listings/:path*',
    '/bookings/:path*',
    '/documents/:path*',
    '/inbox/:path*',
    '/notifications/:path*',
    '/earnings/:path*',
    '/requests/:path*',
    '/saved-searches/:path*',
    '/invite/:path*',
    '/settings/:path*',
  ],
};
