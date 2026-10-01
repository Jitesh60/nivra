import { PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ReviewForm } from '@/components/rentals/claim-forms';
import { getBooking } from '@/lib/bookings';
import { reviewAction } from '../../rental-actions';

export const metadata: Metadata = { title: 'Leave a review' };

export default async function Page({ params }: PageProps<'/bookings/[id]/review'>) {
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();
  if (!booking.can.review) redirect(`/bookings/${id}`);
  return (
    <div className="mx-auto grid max-w-lg gap-6">
      <PageHeader
        title="Leave a review"
        description={`How was renting with ${booking.other.name ?? 'them'}?`}
      />
      <section className="rounded-lg border border-sj-border bg-sj-surface p-5 shadow-xs">
        <ReviewForm submit={reviewAction.bind(null, id)} />
      </section>
    </div>
  );
}
