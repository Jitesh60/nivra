'use client';

import { Button } from '@sajha/ui';
import { useState, useTransition } from 'react';
import { FormMessage } from '@/components/app/form-bits';

type Order = {
  provider: 'razorpay' | 'fake';
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  description: string;
  prefill: { name?: string | null; email?: string | null; contact: string };
};
type Payment = { orderId: string; paymentId: string; signature: string };

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', cb: (e: { error?: { description?: string } }) => void) => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/**
 * Razorpay's web checkout (UPI, cards, netbanking), then the API verifies the
 * signature. On a test server (fake provider) a button completes it instead.
 */
export function Checkout({
  createOrder,
  verify,
  fakePay,
}: {
  createOrder: () => Promise<{ order?: Order; error?: string }>;
  verify: (p: Payment) => Promise<{ error?: string }>;
  fakePay: (orderId: string) => Promise<{ error?: string }>;
}) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const pay = () =>
    start(async () => {
      setError(undefined);
      const { order, error: orderError } = await createOrder();
      if (!order) return setError(orderError ?? 'Couldn’t start the payment.');
      if (order.provider === 'fake') {
        // Test server (PAYMENT_PROVIDER=fake): no real money moves.
        setError((await fakePay(order.orderId))?.error);
        return;
      }
      if (!(await loadRazorpay()) || !window.Razorpay) {
        setError('Couldn’t load the payment window. Check your connection and try again.');
        return;
      }
      await new Promise<void>((done) => {
        const rzp = new window.Razorpay!({
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amountPaise,
          currency: order.currency,
          name: 'Nivra',
          description: order.description,
          prefill: order.prefill,
          theme: { color: '#11846A' },
          handler: async (r: RazorpayResponse) => {
            const result = await verify({
              orderId: r.razorpay_order_id,
              paymentId: r.razorpay_payment_id,
              signature: r.razorpay_signature,
            });
            if (result?.error) setError(result.error);
            done();
          },
          modal: { ondismiss: () => done() },
        });
        rzp.on('payment.failed', (e) => {
          setError(e.error?.description ?? 'The payment failed. You weren’t charged.');
        });
        rzp.open();
      });
    });

  return (
    <div className="grid gap-2">
      <Button type="button" loading={pending} loadingLabel="Opening payment" onClick={pay}>
        Pay with UPI, card or netbanking
      </Button>
      <FormMessage error={error} />
    </div>
  );
}
