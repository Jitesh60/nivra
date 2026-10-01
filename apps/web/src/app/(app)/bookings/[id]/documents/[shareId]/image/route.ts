import { NextResponse, type NextRequest } from 'next/server';
import { userApi } from '@/lib/api';
import { side, streamPrivateImage } from '@/lib/private-image';

/**
 * A document the borrower shared for this booking, for the lender to check.
 * The API logs each view and stops serving it once access ends.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/bookings/[id]/documents/[shareId]/image'>,
) {
  const { id, shareId } = await ctx.params;
  const { data, response } = await (
    await userApi()
  ).GET('/v1/bookings/{id}/documents/{shareId}/view', {
    params: {
      path: { id, shareId },
      query: { side: side(request.nextUrl.searchParams.get('side')) },
    },
  });
  if (!data) {
    return new NextResponse(response.status === 410 ? 'Access ended' : 'Not found', {
      status: response.status === 410 ? 410 : 404,
    });
  }
  return streamPrivateImage(data.url);
}
