import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { getAccessToken } from '@/lib/session';

/** Streams the waitlist CSV from the API, authenticated with the admin's cookie. */
export async function GET() {
  const token = await getAccessToken();
  const res = await fetch(`${API_URL}/v1/admin/waitlist/export.csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json({ error: 'Export failed' }, { status: res.status });
  return new NextResponse(res.body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sajha-waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
