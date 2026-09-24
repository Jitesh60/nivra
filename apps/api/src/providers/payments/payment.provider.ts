import { createHmac } from 'node:crypto';
import { safeEqualHex } from '../../common/crypto/crypto.js';

export interface CreatedOrder {
  orderId: string;
}

export interface ProviderRefund {
  refundId: string;
  /** Razorpay answers `pending` or `processed`; a webhook reports the end state. */
  status: 'pending' | 'processed' | 'failed';
}

export interface LinkedAccountInput {
  /** Our reference (the user id). */
  referenceId: string;
  name: string;
  email: string;
  phone: string;
  pan: string;
  accountNumber: string;
  ifsc: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface ProviderAccount {
  accountId: string;
  status: 'PENDING' | 'NEEDS_CLARIFICATION' | 'ACTIVATED' | 'REJECTED';
  reason?: string;
}

export interface ProviderPayment {
  paymentId: string;
  orderId: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  amountPaise: number;
  method?: string;
}

/** Raised when the payment service refuses or can't be reached; safe to retry later. */
export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/**
 * Takes payments, refunds and lender payouts. Razorpay in staging and
 * production; a fake with the same shapes and signatures in dev and tests.
 * Swap with PAYMENT_PROVIDER.
 */
export abstract class PaymentProvider {
  abstract readonly name: 'razorpay' | 'fake';
  /** Public key the app hands to checkout. */
  abstract readonly keyId: string;

  constructor(
    protected readonly keySecret: string,
    protected readonly webhookSecret: string,
  ) {}

  abstract createOrder(input: {
    amountPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<CreatedOrder>;
  abstract fetchPayment(paymentId: string): Promise<ProviderPayment>;
  abstract refund(input: {
    paymentId: string;
    amountPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<ProviderRefund>;
  abstract createLinkedAccount(input: LinkedAccountInput): Promise<ProviderAccount>;
  /** Moves [amountPaise] of a captured payment to a linked account, optionally held. */
  abstract createTransfer(input: {
    paymentId: string;
    accountId: string;
    amountPaise: number;
    onHold: boolean;
    notes: Record<string, string>;
  }): Promise<{ transferId: string }>;
  abstract reverseTransfer(transferId: string, amountPaise: number): Promise<void>;
  /** Lets a held transfer settle to the lender (after the return, Phase 8). */
  abstract releaseTransfer(transferId: string): Promise<void>;

  /** Checkout's success signature: HMAC-SHA256(`${orderId}|${paymentId}`, key secret). */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    return safeEqualHex(hmac(this.keySecret, `${orderId}|${paymentId}`), signature);
  }

  /** Webhook signature: HMAC-SHA256(raw body, webhook secret). */
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    return safeEqualHex(hmac(this.webhookSecret, rawBody), signature);
  }
}

/** Hex HMAC-SHA256 over a string or the exact raw bytes of a webhook body. */
export function hmac(secret: string, data: Buffer | string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}
