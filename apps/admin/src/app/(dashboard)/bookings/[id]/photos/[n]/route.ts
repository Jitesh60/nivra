import type { AdminBookingDetail } from '@/lib/bookings';
import { streamPhoto } from '@/lib/photo-proxy';

/** One condition photo of a booking, counted across its reports in order. */
export async function GET(request: Request, ctx: RouteContext<'/bookings/[id]/photos/[n]'>) {
  const { id, n } = await ctx.params;
  return streamPhoto<AdminBookingDetail>(
    request,
    `/v1/admin/bookings/${encodeURIComponent(id)}`,
    (b) => b.conditionReports.flatMap((r) => r.photos),
    n,
  );
}
