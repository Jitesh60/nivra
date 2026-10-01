import { PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { RespondForm } from '@/components/rentals/claim-forms';
import { getBooking } from '@/lib/bookings';
import { respondDisputeAction } from '../../rental-actions';

export const metadata: Metadata = { title: 'Respond to the problem' };

export default async function Page({ params }: PageProps<'/bookings/[id]/respond'>) {
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();
  if (!booking.can.respond) redirect(`/bookings/${id}`);
  return (
    <div className="mx-auto grid max-w-lg gap-6">
      <PageHeader
        title="Respond to the problem"
        description={
          'Tell our team your side. They decide fairly using both sides and the condition photos.'
        }
      />
      <section className="rounded-lg border border-sj-border bg-sj-surface p-5 shadow-xs">
        <RespondForm submit={respondDisputeAction.bind(null, id)} />
      </section>
    </div>
  );
}
