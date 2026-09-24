import { NextResponse, type NextRequest } from 'next/server';
import { adminApi } from '@/lib/api';
import { clearSession, getAccessToken } from '@/lib/session';

/**
 * Ends the session: tells the API (best effort), clears every auth cookie and
 * goes to /login. Used by the logout button (POST) and by redirects when the
 * API reports the session is gone (GET ?reason=expired|disabled).
 */
async function handle(request: NextRequest) {
  if (await getAccessToken()) {
    try {
      await (await adminApi()).POST('/v1/admin/auth/logout');
    } catch {
      // Already gone or API down: still sign out locally.
    }
  }
  await clearSession();
  const login = new URL('/login', request.url);
  const reason = request.nextUrl.searchParams.get('reason');
  if (reason) login.searchParams.set('reason', reason);
  return NextResponse.redirect(login, { status: 303 });
}

export const GET = handle;
export const POST = handle;
