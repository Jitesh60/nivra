import type { Schemas } from '@sajha/api-client';

export type AdminPayment = Schemas['AdminPaymentDto'];
export type AdminPaymentDetail = Schemas['AdminPaymentDetailDto'];
export type AdminTransfer = Schemas['AdminTransferDto'];
export type LedgerSummary = Schemas['LedgerSummaryDto'];
export type PaymentStatus = AdminPayment['status'];
export type TransferStatus = AdminTransfer['status'];
export type LedgerAccount = Schemas['AdminLedgerLineDto']['account'];

/** Tabs on /payments; ALL shows every status. */
export const PAYMENT_TABS = [
  'ALL',
  'CAPTURED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FAILED',
] as const;
export type PaymentTab = (typeof PAYMENT_TABS)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus | 'ALL', string> = {
  ALL: 'All',
  CREATED: 'Checkout opened',
  CAPTURED: 'Paid',
  PARTIALLY_REFUNDED: 'Partly refunded',
  REFUNDED: 'Refunded',
  FAILED: 'Failed',
};

export const TRANSFER_TABS = [
  'FAILED',
  'AWAITING_ACCOUNT',
  'ON_HOLD',
  'RELEASED',
  'REVERSED',
] as const satisfies readonly TransferStatus[];

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  AWAITING_ACCOUNT: 'Waiting for bank account',
  ON_HOLD: 'On hold',
  RELEASED: 'Released',
  REVERSED: 'Reversed',
  FAILED: 'Failed',
};

export const REFUND_KIND_LABEL: Record<string, string> = {
  CANCELLATION: 'Cancellation',
  LATE_PAYMENT: 'Late payment',
  MANUAL: 'Goodwill (manual)',
  DEPOSIT_RETURN: 'Deposit back',
};

export const REFUND_STATUS_LABEL: Record<string, string> = {
  PENDING: 'On the way',
  PROCESSED: 'Processed',
  FAILED: 'Failed',
};

export const LEDGER_ACCOUNTS: LedgerAccount[] = [
  'GATEWAY',
  'DEPOSIT_HELD',
  'LENDER_PAYABLE',
  'PLATFORM_REVENUE',
  'GOODWILL',
];

export const LEDGER_ACCOUNT_LABEL: Record<LedgerAccount, string> = {
  GATEWAY: 'Gateway (Razorpay)',
  DEPOSIT_HELD: 'Deposits held',
  LENDER_PAYABLE: 'Owed to lenders',
  PLATFORM_REVENUE: 'Sajha revenue',
  GOODWILL: 'Goodwill refunds',
};

export const LEDGER_ACCOUNT_HINT: Record<LedgerAccount, string> = {
  GATEWAY: 'Money collected and not yet refunded or sent to lenders (shown as a debit).',
  DEPOSIT_HELD: 'Deposits to return after each rental.',
  LENDER_PAYABLE: 'Rent less commission, not yet transferred.',
  PLATFORM_REVENUE: 'Commission and fees kept.',
  GOODWILL: 'Refunds Sajha paid for (a cost, shown as a debit).',
};

export const COMMON_REFUND_REASONS = [
  'Item not as described',
  'Lender didn’t show up',
  'Charged twice',
  'Goodwill after a complaint',
];

/** "₹1,234.50" from paise, as a plain number for inputs ("1234.50"). */
export function rupeesInput(paise: number): string {
  return (paise / 100).toFixed(2).replace(/\.00$/, '');
}

/** Parses "1,234.5" into paise; null when it isn't an amount. */
export function toPaise(input: string): number | null {
  const clean = input.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}
