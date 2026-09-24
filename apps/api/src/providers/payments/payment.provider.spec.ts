import { FakePaymentProvider } from './fake-payment.provider.js';
import { hmac } from './payment.provider.js';
import { accountStatus } from './razorpay.provider.js';

describe('payment signatures', () => {
  const provider = new FakePaymentProvider('rzp_test_key', 'key-secret', 'webhook-secret');

  it('matches Razorpay’s scheme: HMAC-SHA256 of "order|payment" with the key secret', () => {
    // Worked example computed independently (openssl dgst -sha256 -hmac key-secret).
    expect(hmac('key-secret', 'order_abc|pay_xyz')).toBe(
      '7558aa1d9cd6c9a7be5a1bdb05a22e878e4c0ee716d0118ce9b6ae198d083428',
    );
    const { paymentId, signature } = provider.checkout('order_abc');
    expect(provider.verifyPaymentSignature('order_abc', paymentId, signature)).toBe(true);
    expect(provider.verifyPaymentSignature('order_other', paymentId, signature)).toBe(false);
    expect(provider.verifyPaymentSignature('order_abc', paymentId, 'not-hex')).toBe(false);
    expect(provider.verifyPaymentSignature('order_abc', paymentId, signature.slice(2))).toBe(false);
  });

  it('webhooks are signed over the exact raw body', () => {
    const { body, signature } = provider.webhook('payment.captured', { payment: { entity: {} } });
    expect(provider.verifyWebhookSignature(body, signature)).toBe(true);
    expect(provider.verifyWebhookSignature(Buffer.from(body), signature)).toBe(true);
    expect(provider.verifyWebhookSignature(`${body} `, signature)).toBe(false);
  });

  it('maps Route activation states', () => {
    expect(accountStatus('activated').status).toBe('ACTIVATED');
    expect(accountStatus('needs_clarification').status).toBe('NEEDS_CLARIFICATION');
    expect(accountStatus('suspended').status).toBe('REJECTED');
    expect(accountStatus('created').status).toBe('PENDING');
  });
});
