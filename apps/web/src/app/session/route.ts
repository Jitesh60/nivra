import { NextResponse } from 'next/server';
import { getMeOrNull } from '@/lib/api';

/**
 * Who is signed in, for the marketing header (those pages are static, so the
 * header asks from the browser). Only what the header shows; never tokens.
 */
export async function GET() {
  const me = await getMeOrNull();
  return NextResponse.json(
    me ? { signedIn: true, name: me.name, avatarUrl: me.avatarUrl } : { signedIn: false },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
