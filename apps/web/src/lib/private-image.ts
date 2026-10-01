import 'server-only';
import { NextResponse } from 'next/server';

/**
 * Streams a private image (ID documents) through this server. The short-lived
 * signed storage URL never reaches the browser, and nothing is cached.
 */
export async function streamPrivateImage(signedUrl: string): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(signedUrl, { cache: 'no-store' });
  } catch {
    return new NextResponse('Unavailable', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export const side = (value: string | null): 'front' | 'back' =>
  value === 'back' ? 'back' : 'front';
