import { PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DisputeForm } from '@/components/rentals/claim-forms';
import { getBooking } from '@/lib/bookings';
import { openDisputeAction } from '../../rental-actions';

export const metadata: Metadata = { title: 'Report a problem' };

export default async function Page({ params }: PageProps<'/bookings/[id]/dispute'>) {
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();
  if (!booking.can.dispute) redirect(`/bookings/${id}`);
  return (
    <div className="mx-auto grid max-w-lg gap-6">
      <PageHeader
        title="Report a problem"
        description={'Our team reviews both sides and decides how much of the deposit you keep.'}
      />
      <section className="rounded-lg border border-sj-border bg-sj-surface p-5 shadow-xs">
        <DisputeForm
          submit={openDisputeAction.bind(null, id)}
          maxClaimRupees={Math.round(booking.depositPaise / 100)}
        />
      </section>
    </div>
  );
}
