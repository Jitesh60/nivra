import 'server-only';
import { NextResponse } from 'next/server';
import { API_URL } from './api';
import { getAccessToken } from './session';

const NO_STORE = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

interface Photo {
  url: string;
  thumbUrl: string;
}

/**
 * Streams the [n]th of the photos an admin API page lists. The API signs
 * short-lived storage links; they're fetched here on the server, so the
 * storage URL never reaches the browser and nothing is cached.
 */
export async function streamPhoto<T>(
  request: Request,
  apiPath: string,
  pick: (body: T) => Photo[],
  n: string,
): Promise<NextResponse> {
  const token = await getAccessToken();
  if (!token) return new NextResponse(null, { status: 401, headers: NO_STORE });
  const index = Number(n);
  if (!Number.isInteger(index) || index < 0) {
    return new NextResponse(null, { status: 404, headers: NO_STORE });
  }

  const page = await fetch(`${API_URL}${apiPath}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!page.ok) return new NextResponse(null, { status: page.status, headers: NO_STORE });
  const photo = pick((await page.json()) as T)[index];
  if (!photo) return new NextResponse(null, { status: 404, headers: NO_STORE });

  const thumb = new URL(request.url).searchParams.has('thumb');
  const image = await fetch(thumb ? photo.thumbUrl : photo.url, { cache: 'no-store' });
  if (!image.ok || !image.body) return new NextResponse(null, { status: 502, headers: NO_STORE });
  return new NextResponse(image.body, {
    headers: {
      ...NO_STORE,
      'Content-Type': image.headers.get('content-type') ?? 'image/webp',
      'Content-Disposition': 'inline',
    },
  });
}
