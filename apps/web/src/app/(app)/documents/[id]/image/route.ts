import { NextResponse, type NextRequest } from 'next/server';
import { userApi } from '@/lib/api';
import { side, streamPrivateImage } from '@/lib/private-image';

/** The owner's own document photo (front or back). */
export async function GET(request: NextRequest, ctx: RouteContext<'/documents/[id]/image'>) {
  const { id } = await ctx.params;
  const { data } = await (
    await userApi()
  ).GET('/v1/me/documents/{id}/view', {
    params: { path: { id }, query: { side: side(request.nextUrl.searchParams.get('side')) } },
  });
  if (!data) return new NextResponse('Not found', { status: 404 });
  return streamPrivateImage(data.url);
}
