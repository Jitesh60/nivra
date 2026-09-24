import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { getAccessToken } from '@/lib/session';

const NO_STORE = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/**
 * Streams one side of a document to the reviewer. The API returns a
 * short-lived signed storage URL (and logs the view); it's fetched here on the
 * server, so the storage URL never reaches the browser and nothing is cached.
 */
export async function GET(request: Request, ctx: RouteContext<'/documents/[id]/image'>) {
  const { id } = await ctx.params;
  const side = new URL(request.url).searchParams.get('side') === 'back' ? 'back' : 'front';
  const token = await getAccessToken();
  if (!token) return new NextResponse(null, { status: 401, headers: NO_STORE });

  const view = await fetch(
    `${API_URL}/v1/admin/documents/${encodeURIComponent(id)}/view?side=${side}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  if (!view.ok) return new NextResponse(null, { status: view.status, headers: NO_STORE });
  const { url } = (await view.json()) as { url: string };

  const image = await fetch(url, { cache: 'no-store' });
  if (!image.ok || !image.body) {
    return new NextResponse(null, { status: 502, headers: NO_STORE });
  }
  return new NextResponse(image.body, {
    headers: {
      ...NO_STORE,
      'Content-Type': image.headers.get('content-type') ?? 'image/jpeg',
      'Content-Disposition': 'inline',
    },
  });
}
