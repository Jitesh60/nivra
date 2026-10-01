import { PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CodeDisplay } from '@/components/rentals/code-display';
import { attempt, unwrap, userApi } from '@/lib/api';
import { getBooking } from '@/lib/bookings';

export const metadata: Metadata = { title: 'Your code', robots: { index: false } };

/** Shown at the meetup: the other person types these digits (or scans the QR). */
export default async function CodePage({ params }: PageProps<'/bookings/[id]/code'>) {
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();
  if (!booking.can.showCode) redirect(`/bookings/${id}`);
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(api.GET('/v1/bookings/{id}/code', { params: { path: { id } } })),
  );
  if (!result.ok) redirect(`/bookings/${id}`);
  const { stage, code, qr } = result.data;
  const handover = stage === 'HANDOVER';
  return (
    <div className="mx-auto grid max-w-md gap-6 text-center">
      <PageHeader
        title={handover ? 'Pickup code' : 'Return code'}
        description={
          handover
            ? `Show this to ${booking.other.name ?? 'the lender'} when you collect ${booking.listing.title}.`
            : `Show this to ${booking.other.name ?? 'the borrower'} when they return ${booking.listing.title}.`
        }
      />
      <CodeDisplay code={code} qr={qr} status={booking.status} />
      <p className="text-small text-sj-muted-foreground">
        Only share it in person, once you’ve checked the item together. Nivra will never ask for it.
      </p>
      <Link
        href={`/bookings/${id}`}
        className="text-small font-semibold text-sj-primary underline-offset-4 hover:underline"
      >
        Back to the booking
      </Link>
    </div>
  );
}
