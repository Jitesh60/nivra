import { randomBytes } from 'node:crypto';
import {
  type CreatedOrder,
  hmac,
  type LinkedAccountInput,
  type ProviderAccount,
  type ProviderPayment,
  type ProviderRefund,
  PaymentProvider,
  PaymentProviderError,
} from './payment.provider.js';

const id = (prefix: string) => `${prefix}_fake${randomBytes(7).toString('hex')}`;

/**
 * Behaves like Razorpay test mode without the network: Razorpay-shaped ids,
 * the same signature scheme, instant refunds and linked accounts that activate
 * straight away. Dev, tests and CI use it (PAYMENT_PROVIDER=fake).
 * `checkout()` plays the part of the Razorpay checkout sheet.
 */
export class FakePaymentProvider extends PaymentProvider {
  readonly name = 'fake' as const;
  /** Everything the fake was asked to do, for tests. */
  readonly calls: { method: string; args: unknown }[] = [];
  /** Linked accounts start in this state (tests can hold one back). */
  nextAccountStatus: ProviderAccount['status'] = 'ACTIVATED';
  /** Makes the next N provider calls fail, like an outage. */
  failNext = 0;

  constructor(
    readonly keyId: string,
    keySecret: string,
    webhookSecret: string,
  ) {
    super(keySecret, webhookSecret);
  }

  /** What checkout returns to the app on success, signed like Razorpay. */
  checkout(orderId: string): { paymentId: string; signature: string } {
    const paymentId = id('pay');
    return { paymentId, signature: hmac(this.keySecret, `${orderId}|${paymentId}`) };
  }

  /** A webhook body and its signature, as Razorpay would send them. */
  webhook(
    event: string,
    payload: Record<string, unknown>,
  ): { body: string; signature: string; eventId: string } {
    const body = JSON.stringify({
      entity: 'event',
      account_id: 'acc_fakeplatform',
      event,
      contains: Object.keys(payload),
      payload,
      created_at: Math.floor(Date.now() / 1000),
    });
    return { body, signature: hmac(this.webhookSecret, body), eventId: id('evt') };
  }

  async createOrder(input: { amountPaise: number; receipt: string }): Promise<CreatedOrder> {
    this.record('createOrder', input);
    return { orderId: id('order') };
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    this.record('fetchPayment', { paymentId });
    return { paymentId, orderId: '', status: 'captured', amountPaise: 0 };
  }

  async refund(input: { paymentId: string; amountPaise: number }): Promise<ProviderRefund> {
    this.record('refund', input);
    return { refundId: id('rfnd'), status: 'processed' };
  }

  async createLinkedAccount(input: LinkedAccountInput): Promise<ProviderAccount> {
    this.record('createLinkedAccount', { referenceId: input.referenceId, ifsc: input.ifsc });
    return { accountId: id('acc'), status: this.nextAccountStatus };
  }

  async createTransfer(input: {
    paymentId: string;
    accountId: string;
    amountPaise: number;
    onHold: boolean;
  }): Promise<{ transferId: string }> {
    this.record('createTransfer', input);
    return { transferId: id('trf') };
  }

  async reverseTransfer(transferId: string, amountPaise: number): Promise<void> {
    this.record('reverseTransfer', { transferId, amountPaise });
  }

  async releaseTransfer(transferId: string): Promise<void> {
    this.record('releaseTransfer', { transferId });
  }

  private record(method: string, args: unknown): void {
    if (this.failNext > 0) {
      this.failNext--;
      throw new PaymentProviderError(`fake ${method} failed`, 503);
    }
    this.calls.push({ method, args });
  }
}
