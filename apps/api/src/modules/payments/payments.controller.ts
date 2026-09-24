import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  type RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import {
  type AdminAuth,
  AdminJwtGuard,
  CurrentAdmin,
  Roles,
} from '../admin-auth/admin-jwt.guard.js';
import { CurrentUser, JwtAuthGuard, type UserAuth } from '../auth/jwt-auth.guard.js';
import { CancelPreviewDto } from '../bookings/dto/booking.dto.js';
import { EarningsDto, PayoutAccountDto, PayoutAccountInputDto } from '../payouts/dto/payout.dto.js';
import { PayoutsService } from '../payouts/payouts.service.js';
import { AdminPaymentsService } from './admin-payments.service.js';
import {
  AdminPaymentDetailDto,
  AdminPaymentPageDto,
  AdminPaymentsQueryDto,
  AdminPayoutsQueryDto,
  AdminTransferDto,
  AdminTransferPageDto,
  CheckoutDto,
  DevCheckoutDto,
  DevCheckoutResultDto,
  LedgerSummaryDto,
  ManualRefundDto,
  VerifyPaymentDto,
  VerifyResultDto,
} from './dto/payment.dto.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly payouts: PayoutsService,
  ) {}

  @Post('bookings/:id/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Borrower: open checkout for a booking waiting for payment (rent + fee + refundable deposit)',
  })
  @ApiOkResponse({ type: CheckoutDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'PAYMENT_NOT_ALLOWED' })
  pay(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CheckoutDto> {
    return this.payments.checkout(id, auth.userId);
  }

  @Post('payments/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Report checkout success (Razorpay’s order id, payment id and signature). Confirms at once; the webhook is the backstop.',
  })
  @ApiOkResponse({ type: VerifyResultDto })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'PAYMENT_SIGNATURE_INVALID' })
  verify(@CurrentUser() auth: UserAuth, @Body() body: VerifyPaymentDto): Promise<VerifyResultDto> {
    return this.payments.verify(auth.userId, body);
  }

  @Get('bookings/:id/cancel-preview')
  @ApiOperation({ summary: 'What cancelling now would refund to the borrower' })
  @ApiOkResponse({ type: CancelPreviewDto })
  cancelPreview(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CancelPreviewDto> {
    return this.payments.cancelPreview(id, auth.userId);
  }

  @Get('me/payout-account')
  @ApiOperation({ summary: 'Lender: your payout (Razorpay Route) account, or null' })
  @ApiOkResponse({ type: PayoutAccountDto })
  async account(@CurrentUser() auth: UserAuth): Promise<PayoutAccountDto | null> {
    return this.payouts.account(auth.userId);
  }

  @Put('me/payout-account')
  @ApiOperation({
    summary:
      'Lender: set up payouts (bank account, IFSC, PAN). Only the last 4 digits are kept; Razorpay verifies them.',
  })
  @ApiOkResponse({ type: PayoutAccountDto })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'PAYOUT_ACCOUNT_INVALID (already set up)',
  })
  setUp(
    @CurrentUser() auth: UserAuth,
    @Body() body: PayoutAccountInputDto,
  ): Promise<PayoutAccountDto> {
    return this.payouts.setUp(auth.userId, body);
  }

  @Get('me/earnings')
  @ApiOperation({ summary: 'Lender: what you’ve earned, held until returns, and paid out' })
  @ApiOkResponse({ type: EarningsDto })
  earnings(@CurrentUser() auth: UserAuth): Promise<EarningsDto> {
    return this.payouts.earnings(auth.userId);
  }

  @Post('dev/payments/:orderId/checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Development only (PAYMENT_PROVIDER=fake): plays the Razorpay checkout and sends the signed webhook',
  })
  @ApiOkResponse({ type: DevCheckoutResultDto })
  devCheckout(
    @CurrentUser() auth: UserAuth,
    @Param('orderId') orderId: string,
    @Body() body: DevCheckoutDto,
  ): Promise<DevCheckoutResultDto> {
    return this.payments.devCheckout(orderId, auth.userId, body);
  }
}

/** Razorpay calls this; it's authenticated by the HMAC signature, not a token. */
@Controller('payments')
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ): Promise<{ status: string }> {
    return this.payments.webhook(req.rawBody ?? Buffer.from(''), signature, eventId);
  }
}

@ApiTags('admin · payments')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin')
export class AdminPaymentsController {
  constructor(private readonly admin: AdminPaymentsService) {}

  @Get('payments')
  @ApiOperation({ summary: 'Payments, newest first' })
  @ApiOkResponse({ type: AdminPaymentPageDto })
  list(@Query() query: AdminPaymentsQueryDto): Promise<AdminPaymentPageDto> {
    return this.admin.list(query);
  }

  @Get('payments/:id')
  @ApiOperation({ summary: 'A payment with its refunds, transfers and the booking’s ledger lines' })
  @ApiOkResponse({ type: AdminPaymentDetailDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminPaymentDetailDto> {
    return this.admin.get(id);
  }

  @Post('payments/:id/refund')
  @Roles('SUPER_ADMIN', 'OPS')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund part or all of what’s left (goodwill, audited)' })
  @ApiOkResponse({ type: AdminPaymentDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'REFUND_TOO_LARGE' })
  refund(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ManualRefundDto,
    @Client() client: ClientInfo,
  ): Promise<AdminPaymentDetailDto> {
    return this.admin.refund(id, auth.adminId, body, client);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Transfers to lenders, newest first' })
  @ApiOkResponse({ type: AdminTransferPageDto })
  payouts(@Query() query: AdminPayoutsQueryDto): Promise<AdminTransferPageDto> {
    return this.admin.transfers(query);
  }

  @Post('transfers/:id/retry')
  @Roles('SUPER_ADMIN', 'OPS')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Try a failed transfer again' })
  @ApiOkResponse({ type: AdminTransferDto })
  retry(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Client() client: ClientInfo,
  ): Promise<AdminTransferDto> {
    return this.admin.retryTransfer(id, auth.adminId, client);
  }

  @Get('ledger/summary')
  @ApiOperation({ summary: 'Ledger balances and reconciliation checks' })
  @ApiOkResponse({ type: LedgerSummaryDto })
  ledger(): Promise<LedgerSummaryDto> {
    return this.admin.ledgerSummary();
  }
}
