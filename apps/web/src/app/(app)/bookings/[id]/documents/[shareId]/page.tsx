import { PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProtectedImage } from '@/components/bookings/protected-image';
import { getMe } from '@/lib/api';
import { getBooking, USER_DOC_LABEL } from '@/lib/bookings';

export const metadata: Metadata = { title: 'Shared document', robots: { index: false } };

/** The lender checks a borrower's document: watermarked, never cached, views logged by the API. */
export default async function SharedDocumentPage({
  params,
}: PageProps<'/bookings/[id]/documents/[shareId]'>) {
  const { id, shareId } = await params;
  const [booking, me] = await Promise.all([getBooking(id), getMe()]);
  const share = booking?.sharedDocuments.find((s) => s.id === shareId);
  if (!booking || booking.role !== 'LENDER' || !share) notFound();
  const watermark = `Nivra · viewed by ${me.name ?? 'lender'} · ${new Date().toLocaleString(
    'en-IN',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    },
  )} · booking ${id.slice(0, 8)}`;
  const base = `/bookings/${id}/documents/${shareId}/image`;
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <PageHeader
        title={USER_DOC_LABEL[share.docType] ?? 'Document'}
        description={`Shared by ${booking.other.name ?? 'the borrower'} for ${booking.listing.title}.`}
      />
      {share.viewable ? (
        <>
          <ProtectedImage src={`${base}?side=front`} alt="Front" watermark={watermark} />
          {share.hasBack && (
            <ProtectedImage src={`${base}?side=back`} alt="Back" watermark={watermark} />
          )}
        </>
      ) : (
        <p className="rounded-md bg-sj-surface-muted p-4 text-small">
          Access to this document has ended.
        </p>
      )}
      <p className="text-caption text-sj-muted-foreground">
        Use this only to check the borrower’s identity for this booking. Saving or sharing it is
        against Nivra’s terms; every view is logged.
      </p>
    </div>
  );
}
