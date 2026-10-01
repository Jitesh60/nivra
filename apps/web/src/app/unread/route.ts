import { NextResponse } from 'next/server';
import { getUnread } from '@/lib/chat';
import { hasSession } from '@/lib/session';

/** Unread chat and notification counts, polled by the app shell's badges. */
export async function GET() {
  const unread = (await hasSession()) ? await getUnread() : null;
  return NextResponse.json(unread ?? { conversations: 0, messages: 0, notifications: 0 }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
