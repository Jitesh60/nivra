import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// ── Checkout ──

export class CheckoutPrefillDto {
  @ApiPropertyOptional({ type: String, nullable: true }) name: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email: string | null;
  @ApiProperty() contact: string;
}

export class CheckoutDto {
  @ApiProperty({
    enum: ['razorpay', 'fake'],
    description: 'fake: use POST /v1/dev/payments/:orderId/checkout instead of the Razorpay SDK',
  })
  provider: string;
  @ApiProperty({ description: 'Razorpay public key for checkout' }) keyId: string;
  @ApiProperty() orderId: string;
  @ApiProperty() amountPaise: number;
  @ApiProperty() currency: string;
  @ApiProperty() description: string;
  @ApiProperty({ type: CheckoutPrefillDto }) prefill: CheckoutPrefillDto;
}

export class VerifyPaymentDto {
  @ApiProperty({ description: 'razorpay_order_id' })
  @IsString()
  @MaxLength(100)
  orderId: string;

  @ApiProperty({ description: 'razorpay_payment_id' })
  @IsString()
  @MaxLength(100)
  paymentId: string;

  @ApiProperty({ description: 'razorpay_signature' })
  @IsString()
  @MaxLength(200)
  signature: string;
}

export class VerifyResultDto {
  @ApiProperty({ format: 'uuid' }) bookingId: string;
  @ApiProperty({ description: 'The booking’s status now (CONFIRMED once paid)' }) status: string;
}

export class DevCheckoutDto {
  @ApiProperty({ enum: ['success', 'failure'] })
  @IsIn(['success', 'failure'])
  outcome: 'success' | 'failure';

  @ApiPropertyOptional({
    enum: ['now', 'later', 'never'],
    default: 'later',
    description: 'When the signed webhook arrives (later: after ~1 s)',
  })
  @IsOptional()
  @IsIn(['now', 'later', 'never'])
  webhook?: 'now' | 'later' | 'never';
}

export class DevCheckoutResultDto {
  @ApiPropertyOptional({ type: String, nullable: true }) paymentId: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) signature: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) error: string | null;
}

// ── Admin ──

export const PAYMENT_STATUSES = [
  'CREATED',
  'CAPTURED',
  'FAILED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;

export class AdminPaymentsQueryDto {
  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: (typeof PAYMENT_STATUSES)[number];

  @ApiPropertyOptional({
    description: 'Listing title, borrower name or phone, order or payment id, or booking id',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}

export class AdminPaymentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) bookingId: string;
  @ApiProperty() listingTitle: string;
  @ApiPropertyOptional({ type: String, nullable: true }) borrowerName: string | null;
  @ApiProperty() provider: string;
  @ApiProperty() orderId: string;
  @ApiPropertyOptional({ type: String, nullable: true }) paymentId: string | null;
  @ApiProperty() amountPaise: number;
  @ApiProperty({ description: 'Refunded so far (not counting failed refunds)' })
  refundedPaise: number;
  @ApiProperty({ enum: PAYMENT_STATUSES }) status: string;
  @ApiPropertyOptional({ type: String, nullable: true }) method: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) failureReason: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) capturedAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class AdminPaymentPageDto {
  @ApiProperty({ type: [AdminPaymentDto] }) items: AdminPaymentDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor: string | null;
}

export class AdminRefundDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() amountPaise: number;
  @ApiProperty({ enum: ['CANCELLATION', 'LATE_PAYMENT', 'MANUAL'] }) kind: string;
  @ApiProperty({ enum: ['PENDING', 'PROCESSED', 'FAILED'] }) status: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reason: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) providerRefundId: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) failureReason: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) adminName: string | null;
  @ApiProperty() createdAt: Date;
}

export class AdminTransferDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) bookingId: string;
  @ApiProperty({ format: 'uuid' }) lenderId: string;
  @ApiPropertyOptional({ type: String, nullable: true }) lenderName: string | null;
  @ApiProperty() listingTitle: string;
  @ApiProperty() amountPaise: number;
  @ApiProperty() onHold: boolean;
  @ApiProperty({ enum: ['AWAITING_ACCOUNT', 'ON_HOLD', 'RELEASED', 'REVERSED', 'FAILED'] })
  status: string;
  @ApiPropertyOptional({ type: String, nullable: true }) providerTransferId: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) failureReason: string | null;
  @ApiProperty() attempts: number;
  @ApiProperty() createdAt: Date;
}

export class AdminLedgerLineDto {
  @ApiProperty({ format: 'uuid' }) txnId: string;
  @ApiProperty() type: string;
  @ApiProperty({
    enum: ['GATEWAY', 'DEPOSIT_HELD', 'LENDER_PAYABLE', 'PLATFORM_REVENUE', 'GOODWILL'],
  })
  account: string;
  @ApiProperty() debitPaise: number;
  @ApiProperty() creditPaise: number;
  @ApiPropertyOptional({ type: String, nullable: true }) externalRef: string | null;
  @ApiProperty() createdAt: Date;
}

export class AdminPaymentDetailDto extends AdminPaymentDto {
  @ApiProperty() bookingStatus: string;
  @ApiProperty({ description: 'What can still be refunded' }) refundablePaise: number;
  @ApiProperty() rentPaise: number;
  @ApiProperty() feePaise: number;
  @ApiProperty() depositPaise: number;
  @ApiProperty({ type: [AdminRefundDto] }) refunds: AdminRefundDto[];
  @ApiProperty({ type: [AdminTransferDto] }) transfers: AdminTransferDto[];
  @ApiProperty({
    type: [AdminLedgerLineDto],
    description: 'The booking’s ledger lines, oldest first',
  })
  ledger: AdminLedgerLineDto[];
}

export class ManualRefundDto {
  @ApiProperty({ minimum: 100, description: 'Paise (₹1 minimum)' })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  amountPaise: number;

  @ApiProperty({ minLength: 3, maxLength: 300 })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}

export const TRANSFER_STATUSES = [
  'AWAITING_ACCOUNT',
  'ON_HOLD',
  'RELEASED',
  'REVERSED',
  'FAILED',
] as const;

export class AdminPayoutsQueryDto {
  @ApiPropertyOptional({ enum: TRANSFER_STATUSES })
  @IsOptional()
  @IsIn(TRANSFER_STATUSES)
  status?: (typeof TRANSFER_STATUSES)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}

export class AdminTransferPageDto {
  @ApiProperty({ type: [AdminTransferDto] }) items: AdminTransferDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor: string | null;
}

export class LedgerBalancesDto {
  @ApiProperty({
    description: 'Collected and not yet refunded or transferred (credit − debit is negative)',
  })
  GATEWAY: number;
  @ApiProperty() DEPOSIT_HELD: number;
  @ApiProperty() LENDER_PAYABLE: number;
  @ApiProperty() PLATFORM_REVENUE: number;
  @ApiProperty() GOODWILL: number;
}

export class LedgerSummaryDto {
  @ApiProperty({ type: LedgerBalancesDto, description: 'Credits minus debits per account' })
  balances: LedgerBalancesDto;
  @ApiProperty() totalDebitPaise: number;
  @ApiProperty() totalCreditPaise: number;
  @ApiProperty({ description: 'Debits equal credits in every transaction' }) balanced: boolean;
  @ApiProperty({ type: [String] }) unbalancedTxns: string[];
  @ApiProperty({ description: 'Captured payments with no ledger entry (should be 0)' })
  capturedWithoutLedger: number;
  @ApiProperty({ description: 'Refunds that failed at the provider' }) failedRefunds: number;
  @ApiProperty({ description: 'Transfers that failed at the provider' }) failedTransfers: number;
  @ApiProperty({ description: 'Captured, in paise' }) capturedPaise: number;
  @ApiProperty({ description: 'Refunds accepted by the provider, in paise' }) refundedPaise: number;
}
