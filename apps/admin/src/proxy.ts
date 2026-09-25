import { NextResponse, type NextRequest } from 'next/server';

// Kept in sync with src/lib/session.ts (proxy can't import server-only modules).
const ACCESS = 'sajha_admin_at';
const REFRESH = 'sajha_admin_rt';
const REFRESH_MAX_AGE_SEC = 12 * 60 * 60;
const API_URL = process.env.SAJHA_API_URL ?? 'http://localhost:3000';

/** Reachable without a session. */
const PUBLIC = ['/login', '/logout'];

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge,
});

/**
 * Runs before every page:
 * - no session → /login (remembering where the admin was going)
 * - access cookie expired but refresh cookie present → refresh with the API,
 *   rotate both cookies, and let the request continue
 * - signed in and on /login → dashboard
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const access = request.cookies.get(ACCESS)?.value;
  const refresh = request.cookies.get(REFRESH)?.value;

  if (isPublic) {
    if (pathname === '/login' && refresh) return NextResponse.redirect(new URL('/', request.url));
    return NextResponse.next();
  }

  if (!refresh) {
    const login = new URL('/login', request.url);
    if (pathname !== '/') login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (access) return withPathname(request);

  const tokens = await refreshTokens(refresh);
  if (!tokens) return NextResponse.redirect(new URL('/logout?reason=expired', request.url));

  // Make the new access token visible to this request's server components…
  request.cookies.set(ACCESS, tokens.accessToken);
  request.cookies.set(REFRESH, tokens.refreshToken);
  const response = withPathname(request);
  // …and store the rotated pair in the browser.
  response.cookies.set(ACCESS, tokens.accessToken, cookieOptions(tokens.expiresInSec));
  response.cookies.set(REFRESH, tokens.refreshToken, cookieOptions(REFRESH_MAX_AGE_SEC));
  return response;
}

/** Passes the pathname to layouts (they can't read it otherwise). */
function withPathname(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
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

function refreshTokens(refreshToken: string): Promise<Tokens | null> {
  const now = Date.now();
  for (const [token, entry] of refreshes) {
    if (now - entry.at > REUSE_WINDOW_MS) refreshes.delete(token);
  }
  const existing = refreshes.get(refreshToken);
  if (existing) return existing.result;
  const result = callRefresh(refreshToken);
  refreshes.set(refreshToken, { at: now, result });
  return result;
}

async function callRefresh(refreshToken: string): Promise<Tokens | null> {
  try {
    const res = await fetch(`${API_URL}/v1/admin/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|txt)$).*)'],
};
