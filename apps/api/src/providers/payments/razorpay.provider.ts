import {
  type CreatedOrder,
  type LinkedAccountInput,
  type ProviderAccount,
  type ProviderPayment,
  type ProviderRefund,
  PaymentProvider,
  PaymentProviderError,
} from './payment.provider.js';

const BASE = 'https://api.razorpay.com';

type Json = Record<string, unknown>;

/**
 * Razorpay over its REST API (basic auth with the key id and secret).
 * Orders capture automatically; Route moves the lender's share to their
 * linked account, held until the item comes back.
 */
export class RazorpayProvider extends PaymentProvider {
  readonly name = 'razorpay' as const;

  constructor(
    readonly keyId: string,
    keySecret: string,
    webhookSecret: string,
    private readonly http: typeof fetch = fetch,
  ) {
    super(keySecret, webhookSecret);
  }

  async createOrder(input: {
    amountPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<CreatedOrder> {
    const order = await this.call('POST', '/v1/orders', {
      amount: input.amountPaise,
      currency: 'INR',
      receipt: input.receipt,
      notes: input.notes,
      payment: {
        capture: 'automatic',
        capture_options: { automatic_expiry_period: 12, refund_speed: 'normal' },
      },
    });
    return { orderId: order.id as string };
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    const p = await this.call('GET', `/v1/payments/${paymentId}`);
    return {
      paymentId: p.id as string,
      orderId: p.order_id as string,
      status: p.status as ProviderPayment['status'],
      amountPaise: p.amount as number,
      method: p.method as string | undefined,
    };
  }

  async refund(input: {
    paymentId: string;
    amountPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<ProviderRefund> {
    const r = await this.call('POST', `/v1/payments/${input.paymentId}/refund`, {
      amount: input.amountPaise,
      speed: 'normal',
      receipt: input.receipt,
      notes: input.notes,
    });
    return { refundId: r.id as string, status: r.status as ProviderRefund['status'] };
  }

  async createLinkedAccount(input: LinkedAccountInput): Promise<ProviderAccount> {
    const account = await this.call('POST', '/v2/accounts', {
      email: input.email,
      phone: input.phone.replace(/^\+91/, ''),
      type: 'route',
      reference_id: input.referenceId.slice(0, 20),
      legal_business_name: input.name,
      business_type: 'individual',
      contact_name: input.name,
      profile: {
        category: 'others',
        subcategory: 'others',
        addresses: {
          registered: {
            street1: input.street,
            street2: input.city,
            city: input.city,
            state: input.state,
            postal_code: input.postalCode,
            country: 'IN',
          },
        },
      },
      legal_info: { pan: input.pan },
    });
    const id = account.id as string;
    await this.call('POST', `/v2/accounts/${id}/stakeholders`, {
      name: input.name,
      email: input.email,
      kyc: { pan: input.pan },
    });
    const product = await this.call('POST', `/v2/accounts/${id}/products`, {
      product_name: 'route',
      tnc_accepted: true,
    });
    const configured = await this.call(
      'PATCH',
      `/v2/accounts/${id}/products/${product.id as string}`,
      {
        settlements: {
          account_number: input.accountNumber,
          ifsc_code: input.ifsc,
          beneficiary_name: input.name,
        },
        tnc_accepted: true,
      },
    );
    return { accountId: id, ...accountStatus(configured.activation_status as string) };
  }

  async createTransfer(input: {
    paymentId: string;
    accountId: string;
    amountPaise: number;
    onHold: boolean;
    notes: Record<string, string>;
  }): Promise<{ transferId: string }> {
    const res = await this.call('POST', `/v1/payments/${input.paymentId}/transfers`, {
      transfers: [
        {
          account: input.accountId,
          amount: input.amountPaise,
          currency: 'INR',
          on_hold: input.onHold,
          notes: input.notes,
        },
      ],
    });
    const items = res.items as Json[];
    return { transferId: items[0]!.id as string };
  }

  async reverseTransfer(transferId: string, amountPaise: number): Promise<void> {
    await this.call('POST', `/v1/transfers/${transferId}/reversals`, { amount: amountPaise });
  }

  async releaseTransfer(transferId: string): Promise<void> {
    await this.call('PATCH', `/v1/transfers/${transferId}`, { on_hold: false });
  }

  private async call(method: string, path: string, body?: Json): Promise<Json> {
    let res: Response;
    try {
      res = await this.http(`${BASE}${path}`, {
        method,
        headers: {
          authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
          'content-type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new PaymentProviderError(
        `Razorpay unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const json = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) {
      const error = (json.error ?? {}) as Json;
      throw new PaymentProviderError(
        `Razorpay ${method} ${path} → ${res.status}: ${String(error.description ?? 'error')}`,
        res.status,
        error.code as string | undefined,
      );
    }
    return json;
  }
}

/** Razorpay's account activation states, as ours. */
export function accountStatus(activation: string | undefined): Pick<ProviderAccount, 'status'> {
  switch (activation) {
    case 'activated':
      return { status: 'ACTIVATED' };
    case 'needs_clarification':
      return { status: 'NEEDS_CLARIFICATION' };
    case 'rejected':
    case 'suspended':
      return { status: 'REJECTED' };
    default:
      return { status: 'PENDING' };
  }
}
