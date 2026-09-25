import { createHash } from 'node:crypto';
import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Env } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FakePaymentProvider } from '../../providers/payments/fake-payment.provider.js';
import { PaymentProvider } from '../../providers/payments/payment.provider.js';
import { accountStatus } from '../../providers/payments/razorpay.provider.js';
import {
  bookingNotFound,
  BookingStateMachine,
  type Transition,
} from '../bookings/booking-state-machine.js';
import { PAID_STATUSES, refundFor } from '../bookings/booking-rules.js';
import type { CancelPreviewDto } from '../bookings/dto/booking.dto.js';
import { rupees } from '../chat/chat-presenter.js';
import { LISTING_RULES } from '../listings/listing-rules.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PayoutsService } from '../payouts/payouts.service.js';
import type { CheckoutDto, DevCheckoutDto, DevCheckoutResultDto } from './dto/payment.dto.js';
import { capturePostings, cashOf, depositKeepPostings, refundPostings } from './ledger.js';
import { creditBackFor, releaseCredit } from '../referrals/credits.js';
import { LedgerService } from './ledger.service.js';
import { RefundsService } from './refunds.service.js';

/** A payment is captured by the webhook (the source of truth) or by the app's verify call. */
type CaptureSource = 'webhook' | 'verify';

/**
 * Checkout, confirmation and the money side of cancellations
 * (docs/ARCHITECTURE.md §6). Both the webhook and the app's verify call lead
 * to [capture], which is idempotent: whichever comes first confirms.
 */
@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly machine: BookingStateMachine,
    private readonly ledger: LedgerService,
    private readonly refunds: RefundsService,
    private readonly payouts: PayoutsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    this.machine.onTransition((t) => this.onBookingChanged(t));
  }

  // ── Checkout ──

  /** Opens (or reopens) checkout for a booking waiting for payment. */
  async checkout(bookingId: string, userId: string): Promise<CheckoutDto> {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { borrower: true, listing: { select: { title: true } } },
    });
    if (!b || (b.borrowerId !== userId && b.lenderId !== userId)) throw bookingNotFound();
    if (b.borrowerId !== userId) {
      throw notAllowed('Only the borrower pays for a booking');
    }
    if (b.status !== 'AWAITING_PAYMENT' || (b.expiresAt && b.expiresAt <= new Date())) {
      throw notAllowed('This booking isn’t waiting for payment', { status: b.status });
    }
    let payment = await this.prisma.payment.findFirst({
      where: { bookingId, status: { in: ['CREATED', 'FAILED'] }, amountPaise: b.totalPaise },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) {
      let order;
      try {
        order = await this.provider.createOrder({
          amountPaise: b.totalPaise,
          receipt: bookingId.replace(/-/g, '').slice(-32),
          notes: { bookingId },
        });
      } catch (err) {
        throw new AppException(
          ErrorCode.PAYMENT_PROVIDER_ERROR,
          'Payments aren’t available right now. Please try again in a minute.',
          HttpStatus.BAD_GATEWAY,
          { reason: err instanceof Error ? err.message : String(err) },
        );
      }
      payment = await this.prisma.payment.create({
        data: {
          bookingId,
          provider: this.provider.name,
          orderId: order.orderId,
          amountPaise: b.totalPaise,
        },
      });
    }
    return {
      provider: this.provider.name,
      keyId: this.provider.keyId,
      orderId: payment.orderId,
      amountPaise: payment.amountPaise,
      currency: payment.currency,
      description: b.listing.title,
      prefill: { name: b.borrower.name, email: b.borrower.email, contact: b.borrower.phone },
    };
  }

  /** The app reports checkout success; the signature proves it came from Razorpay. */
  async verify(
    userId: string,
    input: { orderId: string; paymentId: string; signature: string },
  ): Promise<{ bookingId: string; status: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId: input.orderId },
      include: { booking: { select: { borrowerId: true } } },
    });
    if (!payment || payment.booking.borrowerId !== userId) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Payment not found', HttpStatus.NOT_FOUND);
    }
    if (!this.provider.verifyPaymentSignature(input.orderId, input.paymentId, input.signature)) {
      throw new AppException(
        ErrorCode.PAYMENT_SIGNATURE_INVALID,
        'We couldn’t confirm this payment. If money left your account, it will be refunded.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.capture(input.orderId, input.paymentId, undefined, 'verify');
    const b = await this.prisma.booking.findUniqueOrThrow({
      where: { id: payment.bookingId },
      select: { status: true },
    });
    return { bookingId: payment.bookingId, status: b.status };
  }

  /**
   * Marks the order's payment captured, posts it to the ledger and confirms
   * the booking. Safe to call twice. A payment for a booking that's no
   * longer waiting (it expired or was cancelled meanwhile) is refunded in full.
   */
  async capture(
    orderId: string,
    paymentId: string,
    method: string | undefined,
    source: CaptureSource,
  ): Promise<void> {
    const captured = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE order_id = ${orderId} FOR UPDATE`;
      const p = await tx.payment.findUnique({
        where: { orderId },
        include: {
          booking: {
            select: { rentPaise: true, feePaise: true, depositPaise: true, creditPaise: true },
          },
        },
      });
      if (!p) {
        this.logger.warn(`Capture for unknown order ${orderId} (${source})`);
        return null;
      }
      if (p.status !== 'CREATED' && p.status !== 'FAILED') return null; // already captured
      const updated = await tx.payment.update({
        where: { id: p.id },
        data: {
          status: 'CAPTURED',
          paymentId,
          method: method ?? p.method,
          capturedAt: new Date(),
          failureReason: null,
        },
      });
      await this.ledger.post(
        tx,
        { type: 'PAYMENT_CAPTURED', bookingId: p.bookingId, externalRef: paymentId },
        capturePostings(p.booking, LISTING_RULES.commissionBps),
      );
      return updated;
    });
    if (!captured) return;

    const t = await this.machine.transition(
      captured.bookingId,
      'confirmPayment',
      { party: 'SYSTEM', id: null },
      { onlyIf: (b) => b.status === 'AWAITING_PAYMENT' },
    );
    if (t) return;
    // Paid too late: the booking expired or was cancelled while checkout was open.
    this.logger.warn(`Late payment ${paymentId} for booking ${captured.bookingId}: refunding`);
    const b = await this.prisma.booking.findUniqueOrThrow({ where: { id: captured.bookingId } });
    await this.refunds.create({
      paymentRowId: captured.id,
      kind: 'LATE_PAYMENT',
      amounts: { rentPaise: b.rentPaise, feePaise: b.feePaise, depositPaise: b.depositPaise },
      reason: `Paid after the booking was ${b.status.toLowerCase()}`,
    });
  }

  /** Razorpay (or the app) reports a failed attempt; the booking can be paid again. */
  async markFailed(orderId: string, reason: string): Promise<void> {
    await this.prisma.payment.updateMany({
      where: { orderId, status: 'CREATED' },
      data: { status: 'FAILED', failureReason: reason.slice(0, 500) },
    });
  }

  // ── Webhooks ──

  /**
   * A Razorpay webhook. The signature is checked over the raw body; each
   * event is applied once (Razorpay retries until it gets a 2xx).
   */
  async webhook(
    rawBody: Buffer,
    signature: string | undefined,
    eventIdHeader?: string,
  ): Promise<{ status: string }> {
    if (!signature || !this.provider.verifyWebhookSignature(rawBody, signature)) {
      throw new AppException(
        ErrorCode.WEBHOOK_SIGNATURE_INVALID,
        'Invalid webhook signature',
        HttpStatus.BAD_REQUEST,
      );
    }
    const event = JSON.parse(rawBody.toString('utf8')) as WebhookBody;
    const eventId = eventIdHeader || createHash('sha256').update(rawBody).digest('hex');
    try {
      await this.prisma.webhookEvent.create({
        data: { provider: this.provider.name, eventId, type: event.event },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { status: 'duplicate' };
      }
      throw err;
    }
    await this.apply(event);
    await this.prisma.webhookEvent.update({
      where: { provider_eventId: { provider: this.provider.name, eventId } },
      data: { processedAt: new Date() },
    });
    return { status: 'ok' };
  }

  private async apply(event: WebhookBody): Promise<void> {
    const p = event.payload;
    switch (event.event) {
      case 'payment.captured': {
        const e = p.payment!.entity;
        return this.capture(e.order_id as string, e.id as string, e.method as string, 'webhook');
      }
      case 'payment.failed': {
        const e = p.payment!.entity;
        return this.markFailed(
          e.order_id as string,
          (e.error_description as string) ?? 'Payment failed',
        );
      }
      case 'refund.processed':
        return this.refunds.settle(p.refund!.entity.id as string, true);
      case 'refund.failed':
        return this.refunds.settle(p.refund!.entity.id as string, false);
      case 'transfer.failed':
        await this.prisma.transfer.updateMany({
          where: { providerTransferId: p.transfer!.entity.id as string },
          data: { status: 'FAILED', failureReason: 'Failed at Razorpay' },
        });
        return;
      default:
        if (event.event.startsWith('account.')) {
          const e = p.account!.entity;
          const status = accountStatus(event.event.replace('account.', ''));
          return this.payouts.accountChanged(e.id as string, status.status);
        }
    }
  }

  // ── Cancellation ──

  /** What cancelling now would refund (by whoever is asking). */
  async cancelPreview(bookingId: string, userId: string): Promise<CancelPreviewDto> {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payments: { where: { status: 'CAPTURED' }, take: 1 } },
    });
    if (!b || (b.borrowerId !== userId && b.lenderId !== userId)) throw bookingNotFound();
    if (!(PAID_STATUSES as readonly string[]).includes(b.status) || b.payments.length === 0) {
      return {
        refundPaise: 0,
        rentPaise: 0,
        feePaise: 0,
        depositPaise: 0,
        creditBackPaise: 0,
        tier: null,
        summary: 'Nothing has been paid, so there’s nothing to refund.',
      };
    }
    const party = b.borrowerId === userId ? 'BORROWER' : 'LENDER';
    const r = refundFor(b, party, new Date());
    // Rent paid with referral credit comes back as credit, not cash.
    const creditBack = creditBackFor(b.creditPaise, r.rentPaise);
    const cash = r.totalPaise - creditBack;
    const asCredit = creditBack > 0 ? ` (plus ${rupees(creditBack)} back as credit)` : '';
    return {
      refundPaise: cash,
      rentPaise: r.rentPaise,
      feePaise: r.feePaise,
      depositPaise: r.depositPaise,
      creditBackPaise: creditBack,
      tier: r.tier,
      summary:
        party === 'LENDER'
          ? `The borrower gets everything back (${rupees(cash)}${asCredit}), and the cancellation counts against you.`
          : r.tier === 'FULL'
            ? `You get everything back: ${rupees(cash)}${asCredit}.`
            : r.tier === 'HALF_RENT'
              ? `Less than 48 hours before pickup: you get half the rent and the deposit back, ${rupees(cash)}${asCredit}.`
              : `Less than 24 hours before pickup: you get the deposit back, ${rupees(cash)}; the rent isn’t refunded.`,
    };
  }

  /** Money work after a booking changes: pay the lender, or refund a cancelled paid booking. */
  private async onBookingChanged(t: Transition): Promise<void> {
    if (t.event === 'PAID') {
      await this.payouts.onConfirmed(t.booking.id);
      return;
    }
    // A no-show is a late borrower cancellation: the deposit back, the rent kept.
    if (
      (t.event === 'CANCELLED' || t.event === 'NO_SHOW') &&
      (PAID_STATUSES as readonly string[]).includes(t.from)
    ) {
      await this.refundCancelled(t.booking.id);
      return;
    }
    if (t.event === 'COMPLETED' || t.event === 'DISPUTE_RESOLVED') {
      await this.settle(t.booking.id);
    }
  }

  /**
   * The rental is over: the lender keeps part of the deposit (late fee,
   * dispute award), the held rent is released, and the rest of the deposit
   * goes back to the borrower. Every step is idempotent (the sweep re-runs it).
   */
  async settle(bookingId: string): Promise<void> {
    const b = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        payments: { where: { status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } }, take: 1 },
        refunds: { where: { kind: 'DEPOSIT_RETURN' } },
      },
    });
    const payment = b.payments[0];
    if (b.status !== 'COMPLETED' || !payment) return;
    const kept = Math.min(b.keptPaise, b.depositPaise);

    if (kept > 0) {
      await this.prisma.$transaction(async (tx) => {
        // Serialise with a concurrent settle (the sweep) on the same booking.
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
        const posted = await tx.ledgerEntry.count({ where: { bookingId, type: 'DEPOSIT_KEPT' } });
        if (posted === 0) {
          await this.ledger.post(
            tx,
            { type: 'DEPOSIT_KEPT', bookingId, externalRef: null },
            depositKeepPostings(kept),
          );
        }
      });
    }
    await this.payouts.release(bookingId);
    await this.payouts.sendKept(bookingId, kept);

    const back = b.depositPaise - kept;
    if (back > 0 && b.refunds.length === 0) {
      await this.refunds.create({
        paymentRowId: payment.id,
        kind: 'DEPOSIT_RETURN',
        amounts: { rentPaise: 0, feePaise: 0, depositPaise: back },
        reason:
          kept > 0
            ? `Deposit back after the rental, less ${rupees(kept)} kept by the lender`
            : 'Deposit back after the rental',
      });
    }
  }

  /** Refunds a cancelled paid booking by the policy, then settles the lender's side. */
  async refundCancelled(bookingId: string): Promise<void> {
    const b = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        payments: { where: { status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } }, take: 1 },
        refunds: { where: { kind: 'CANCELLATION' } },
      },
    });
    const payment = b.payments[0];
    if (!payment || b.refunds.length > 0) return; // nothing paid, or already refunded
    const party = b.cancelledBy ?? 'ADMIN';
    const r = refundFor(b, party, b.closedAt ?? new Date());
    // Referral credit comes back first, as credit; only the rest is cash (Phase 10).
    // Retried by the sweep: reuse what was given back the first time.
    const released = await this.prisma.creditEntry.findFirst({
      where: { bookingId, kind: 'RELEASE' },
    });
    const creditBack = released
      ? released.amountPaise
      : await releaseCredit(this.prisma, bookingId, creditBackFor(b.creditPaise, r.rentPaise));
    const amounts = {
      rentPaise: r.rentPaise,
      feePaise: r.feePaise,
      depositPaise: r.depositPaise,
      creditBackPaise: creditBack,
    };
    if (cashOf(amounts) === 0 && creditBack > 0) {
      // Nothing to send to the card, but the rent still leaves the lender's side.
      if (await this.prisma.ledgerEntry.count({ where: { bookingId, type: 'REFUND_CREDIT' } })) {
        return;
      }
      await this.prisma.$transaction((tx) =>
        this.ledger.post(
          tx,
          { type: 'REFUND_CREDIT', bookingId },
          refundPostings(amounts, b.rentPaise, LISTING_RULES.commissionBps),
        ),
      );
      await this.payouts.onCancelled(bookingId, r.rentPaise);
      return;
    }
    await this.refunds.create({
      paymentRowId: payment.id,
      kind: 'CANCELLATION',
      amounts,
      reason: b.noShowAt
        ? 'The borrower didn’t come for the pickup (deposit only)'
        : `Cancelled by the ${party.toLowerCase()} (${r.tier.toLowerCase().replace('_', ' ')})`,
    });
    await this.payouts.onCancelled(bookingId, r.rentPaise);
  }

  /**
   * Safety net (every few minutes): cancelled paid bookings without a refund,
   * and provider calls that failed.
   */
  async sweep(): Promise<void> {
    const missed = await this.prisma.booking.findMany({
      where: {
        status: 'CANCELLED',
        payments: { some: { status: 'CAPTURED' } },
        refunds: { none: { kind: 'CANCELLATION' } },
        closedAt: { lt: new Date(Date.now() - 60_000) },
      },
      select: { id: true },
      take: 50,
    });
    for (const { id } of missed) await this.refundCancelled(id);
    // Completed rentals with money still to move (rent held, deposit not back).
    const unsettled = await this.prisma.booking.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: { lt: new Date(Date.now() - 60_000) },
        payments: { some: { status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } } },
        OR: [
          { transfers: { some: { status: 'ON_HOLD', fromDeposit: false } } },
          { refunds: { none: { kind: 'DEPOSIT_RETURN' } } },
        ],
      },
      select: { id: true, depositPaise: true, keptPaise: true, transfers: true },
      take: 50,
    });
    for (const b of unsettled) {
      const held = b.transfers.some((t) => t.status === 'ON_HOLD' && !t.fromDeposit);
      // All of the deposit kept, nothing held: nothing to do.
      if (!held && b.keptPaise >= b.depositPaise) continue;
      await this.settle(b.id);
    }
    await this.refunds.retryFailed();
    await this.payouts.retryFailed();
  }

  // ── Development checkout (fake provider only) ──

  /** Plays the Razorpay checkout sheet for the fake provider (dev, tests, Playwright). */
  async devCheckout(
    orderId: string,
    userId: string,
    dto: DevCheckoutDto,
  ): Promise<DevCheckoutResultDto> {
    const fake = this.provider;
    const env = this.config.get('NODE_ENV', { infer: true });
    if (!(fake instanceof FakePaymentProvider) || env === 'production' || env === 'staging') {
      throw new AppException(ErrorCode.NOT_FOUND, 'Not found', HttpStatus.NOT_FOUND);
    }
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
      include: { booking: { select: { borrowerId: true } } },
    });
    if (!payment || payment.booking.borrowerId !== userId) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Payment not found', HttpStatus.NOT_FOUND);
    }
    const deliver = async (event: string, entity: Record<string, unknown>) => {
      const hook = fake.webhook(event, { payment: { entity } });
      const run = () =>
        this.webhook(Buffer.from(hook.body), hook.signature, hook.eventId).catch((err: unknown) =>
          this.logger.warn(`Fake webhook failed: ${String(err)}`),
        );
      if (dto.webhook === 'now') await run();
      else if (dto.webhook !== 'never') setTimeout(() => void run(), 800);
    };
    if (dto.outcome === 'failure') {
      await deliver('payment.failed', {
        id: `pay_fakefail${Date.now()}`,
        order_id: orderId,
        amount: payment.amountPaise,
        status: 'failed',
        error_description: 'Payment declined by the bank (test)',
      });
      return { paymentId: null, signature: null, error: 'Payment declined by the bank (test)' };
    }
    const { paymentId, signature } = fake.checkout(orderId);
    await deliver('payment.captured', {
      id: paymentId,
      order_id: orderId,
      amount: payment.amountPaise,
      status: 'captured',
      method: 'upi',
    });
    return { paymentId, signature, error: null };
  }
}

interface WebhookBody {
  event: string;
  payload: Partial<
    Record<'payment' | 'refund' | 'transfer' | 'account', { entity: Record<string, unknown> }>
  >;
}

function notAllowed(message: string, details?: Record<string, unknown>): AppException {
  return new AppException(ErrorCode.PAYMENT_NOT_ALLOWED, message, HttpStatus.CONFLICT, details);
}
