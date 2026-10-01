import { PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Checkout } from '@/components/bookings/checkout';
import { getBooking } from '@/lib/bookings';
import { rupees } from '@/lib/format';
import { createOrderAction, fakeCheckoutAction, verifyPaymentAction } from '../../actions';

export const metadata: Metadata = { title: 'Pay' };

export default async function PayPage({ params }: PageProps<'/bookings/[id]/pay'>) {
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();
  if (!booking.can.pay) redirect(`/bookings/${id}`);

  return (
    <div className="mx-auto grid max-w-lg gap-6">
      <PageHeader title="Pay to confirm" description={booking.listing.title} />
      <section className="grid gap-4 rounded-lg border border-sj-border bg-sj-surface p-6 shadow-sm">
        <p className="flex items-baseline justify-between">
          <span className="text-sj-muted-foreground">Total</span>
          <span className="font-display text-h2">{rupees(booking.totalPaise)}</span>
        </p>
        <p className="text-caption text-sj-muted-foreground">
          Includes a refundable deposit of {rupees(booking.depositPaise)}, returned after a good
          return.
        </p>
        <Checkout
          createOrder={createOrderAction.bind(null, id)}
          verify={verifyPaymentAction.bind(null, id)}
          fakePay={fakeCheckoutAction.bind(null, id)}
        />
      </section>
    </div>
  );
}
