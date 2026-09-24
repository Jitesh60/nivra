import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Refund, RefundKind } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PaymentProvider } from '../../providers/payments/payment.provider.js';
import { rupees } from '../chat/chat-presenter.js';
import { LISTING_RULES } from '../listings/listing-rules.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { type Amounts, goodwillPostings, refundPostings } from './ledger.js';
import { LedgerService } from './ledger.service.js';
import { refundMessage } from '../../providers/email/templates.js';
import { Mailer } from '../mail/mailer.service.js';

/** Failed provider calls are retried this many times before an admin has to look. */
export const MAX_ATTEMPTS = 5;

const COUNTED = ['PENDING', 'PROCESSED'] as const;

/**
 * Money back to borrowers. A refund row is written first; the provider call
 * follows and, once Razorpay accepts it, the ledger is posted. A failed call
 * is retried by the sweep (without a provider id, so it's never sent twice).
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
    private readonly mailer: Mailer,
  ) {}

  /** What can still be refunded from a captured payment. */
  async refundable(paymentRowId: string): Promise<number> {
    const p = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentRowId },
      include: { refunds: { where: { status: { in: [...COUNTED] } } } },
    });
    if (!['CAPTURED', 'PARTIALLY_REFUNDED'].includes(p.status)) return 0;
    return p.amountPaise - p.refunds.reduce((s, r) => s + r.amountPaise, 0);
  }

  /**
   * Starts a refund of [amounts] (split into rent, fee and deposit for the
   * ledger) or, for goodwill, a plain [amountPaise].
   */
  async create(input: {
    paymentRowId: string;
    kind: RefundKind;
    amounts?: Amounts;
    amountPaise?: number;
    reason: string;
    adminId?: string;
  }): Promise<Refund | null> {
    const amount = input.amounts
      ? input.amounts.rentPaise + input.amounts.feePaise + input.amounts.depositPaise
      : input.amountPaise!;
    if (amount <= 0) return null;
    const left = await this.refundable(input.paymentRowId);
    if (amount > left) {
      throw new AppException(
        ErrorCode.REFUND_TOO_LARGE,
        `At most ${rupees(left)} can still be refunded`,
        HttpStatus.BAD_REQUEST,
        { refundablePaise: left },
      );
    }
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: input.paymentRowId },
    });
    const refund = await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        bookingId: payment.bookingId,
        amountPaise: amount,
        breakdown: input.amounts ? { ...input.amounts } : undefined,
        kind: input.kind,
        reason: input.reason,
        adminId: input.adminId ?? null,
      },
    });
    return this.attempt(refund.id);
  }

  /** Sends a refund to the provider (first try, or a retry of a failed one). */
  async attempt(refundId: string): Promise<Refund> {
    const r = await this.prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: {
        payment: true,
        booking: {
          select: { rentPaise: true, borrowerId: true, listing: { select: { title: true } } },
        },
      },
    });
    // Claim it, so two retries can't both send it.
    const claimed = await this.prisma.refund.updateMany({
      where: {
        id: r.id,
        providerRefundId: null,
        status: { in: ['PENDING', 'FAILED'] },
        attempts: r.attempts,
      },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return this.prisma.refund.findUniqueOrThrow({ where: { id: r.id } });

    let result;
    try {
      result = await this.provider.refund({
        paymentId: r.payment.paymentId!,
        amountPaise: r.amountPaise,
        receipt: r.id,
        notes: { bookingId: r.bookingId, kind: r.kind },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Refund ${r.id} failed: ${message}`);
      return this.prisma.refund.update({
        where: { id: r.id },
        data: { status: 'FAILED', failureReason: message.slice(0, 500) },
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.refund.update({
        where: { id: r.id },
        data: {
          providerRefundId: result.refundId,
          status: result.status === 'processed' ? 'PROCESSED' : 'PENDING',
          failureReason: null,
        },
      });
      const lines =
        r.kind === 'MANUAL'
          ? goodwillPostings(r.amountPaise)
          : refundPostings(
              r.breakdown as unknown as Amounts,
              r.booking.rentPaise,
              LISTING_RULES.commissionBps,
            );
      await this.ledger.post(
        tx,
        {
          type: r.kind === 'MANUAL' ? 'REFUND_GOODWILL' : 'REFUND',
          bookingId: r.bookingId,
          externalRef: result.refundId,
        },
        lines,
      );
      const refunded = await tx.refund.aggregate({
        where: {
          paymentId: r.paymentId,
          status: { in: [...COUNTED] },
          providerRefundId: { not: null },
        },
        _sum: { amountPaise: true },
      });
      await tx.payment.update({
        where: { id: r.paymentId },
        data: {
          status:
            (refunded._sum.amountPaise ?? 0) >= r.payment.amountPaise
              ? 'REFUNDED'
              : 'PARTIALLY_REFUNDED',
        },
      });
      return saved;
    });
    await this.notifications.notify(
      r.booking.borrowerId,
      {
        type: 'payment.refund',
        title: 'Refund on the way',
        body: `${rupees(r.amountPaise)} is being refunded to how you paid. It usually shows up in 5–7 working days.`,
        bookingId: r.bookingId,
      },
      { push: true },
    );
    const to = await this.mailer.forBookings(r.booking.borrowerId);
    if (to) {
      await this.mailer.send(
        `refund-${r.id}`,
        refundMessage({
          to: to.email,
          name: to.name,
          listingTitle: r.booking.listing.title,
          amountPaise: r.amountPaise,
          kind: r.kind,
        }),
      );
    }
    return updated;
  }

  /** Razorpay reports the end of a refund. */
  async settle(providerRefundId: string, ok: boolean, reason?: string): Promise<void> {
    await this.prisma.refund.updateMany({
      where: { providerRefundId },
      data: ok
        ? { status: 'PROCESSED' }
        : { status: 'FAILED', failureReason: reason ?? 'Refund failed at Razorpay' },
    });
  }

  /** Retries refunds whose provider call failed (never ones Razorpay accepted). */
  async retryFailed(): Promise<number> {
    const failed = await this.prisma.refund.findMany({
      where: { status: 'FAILED', providerRefundId: null, attempts: { lt: MAX_ATTEMPTS } },
      select: { id: true },
      take: 100,
    });
    for (const { id } of failed) await this.attempt(id);
    return failed.length;
  }
}
