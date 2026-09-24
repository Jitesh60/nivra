import type { AdminDisputeDetail } from '@/lib/disputes';
import { streamPhoto } from '@/lib/photo-proxy';

/**
 * One photo of a dispute: the condition photos (in order), then the claim's
 * evidence, then the borrower's reply.
 */
export async function GET(request: Request, ctx: RouteContext<'/disputes/[id]/photos/[n]'>) {
  const { id, n } = await ctx.params;
  return streamPhoto<AdminDisputeDetail>(
    request,
    `/v1/admin/disputes/${encodeURIComponent(id)}`,
    disputePhotos,
    n,
  );
}

function disputePhotos(d: AdminDisputeDetail) {
  return [...d.conditionReports.flatMap((r) => r.photos), ...d.evidence, ...d.responsePhotos];
}
