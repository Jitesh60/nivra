import { PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { StageForm } from '@/components/rentals/stage-form';
import { getBooking } from '@/lib/bookings';
import { confirmStageAction } from '../../rental-actions';

export const metadata: Metadata = { title: 'Hand over' };

export default async function StageHandoverPage({ params }: PageProps<'/bookings/[id]/handover'>) {
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();
  if (!booking.can.handover) redirect(`/bookings/${id}`);
  return (
    <div className="mx-auto grid max-w-lg gap-6">
      <PageHeader
        title={`Hand over ${booking.listing.title}`}
        description={`Ask ${booking.other.name ?? 'the borrower'} for their pickup code, check the item together, and photograph it.`}
      />
      <section className="rounded-lg border border-sj-border bg-sj-surface p-5 shadow-xs">
        <StageForm stage="handover" submit={confirmStageAction.bind(null, id, 'handover')} />
      </section>
    </div>
  );
}
