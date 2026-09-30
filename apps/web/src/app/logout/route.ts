import { NextResponse, type NextRequest } from 'next/server';
import { userApi } from '@/lib/api';
import { clearSession, getAccessToken } from '@/lib/session';

/**
 * Ends the session: tells the API (best effort), clears the auth cookies and
 * goes to /login. Used by the Sign out button (POST) and by redirects when
 * the API reports the session is gone (GET ?reason=expired|suspended).
 */
async function handle(request: NextRequest) {
  if (await getAccessToken()) {
    try {
      await (await userApi()).POST('/v1/auth/logout');
    } catch {
      // Already gone or API down: still sign out locally.
    }
  }
  await clearSession();
  const reason = request.nextUrl.searchParams.get('reason');
  const target = new URL(reason ? '/login' : '/', request.url);
  if (reason) target.searchParams.set('reason', reason);
  return NextResponse.redirect(target, { status: 303 });
}

export const GET = handle;
export const POST = handle;
