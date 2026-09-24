import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { PayoutAccount, Transfer } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PaymentProvider } from '../../providers/payments/payment.provider.js';
import { isoDate } from '../bookings/booking-presenter.js';
import { LISTING_RULES } from '../listings/listing-rules.js';
import { lenderShare, reversalPostings, transferPostings } from '../payments/ledger.js';
import { LedgerService } from '../payments/ledger.service.js';
import { MAX_ATTEMPTS } from '../payments/refunds.service.js';
import type { EarningsDto, PayoutAccountDto, PayoutAccountInputDto } from './dto/payout.dto.js';

/**
 * Lender payouts through Razorpay Route: a linked account per lender, and a
 * transfer of rent less commission for each confirmed booking, held until
 * the item comes back (released in Phase 8). Earnings wait for the account.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly ledger: LedgerService,
  ) {}

  // ── Payout account ──

  async account(userId: string): Promise<PayoutAccountDto | null> {
    const a = await this.prisma.payoutAccount.findUnique({ where: { userId } });
    return a ? present(a) : null;
  }

  /** Sets up (or, after a rejection, redoes) the lender's linked account. */
  async setUp(userId: string, input: PayoutAccountInputDto): Promise<PayoutAccountDto> {
    const existing = await this.prisma.payoutAccount.findUnique({ where: { userId } });
    if (existing && (existing.status === 'ACTIVATED' || existing.status === 'PENDING')) {
      throw new AppException(
        ErrorCode.PAYOUT_ACCOUNT_INVALID,
        'Your payout account is already set up. Contact support to change it.',
        HttpStatus.CONFLICT,
        { status: existing.status },
      );
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    let created;
    try {
      created = await this.provider.createLinkedAccount({
        referenceId: userId.replace(/-/g, ''),
        name: input.beneficiaryName.trim(),
        email: input.email,
        phone: user.phone,
        pan: input.pan,
        accountNumber: input.accountNumber,
        ifsc: input.ifsc,
        street: input.street.trim(),
        city: input.city.trim(),
        state: input.state.trim(),
        postalCode: input.postalCode,
      });
    } catch (err) {
      throw new AppException(
        ErrorCode.PAYMENT_PROVIDER_ERROR,
        'We couldn’t set up your payout account right now. Check the details and try again.',
        HttpStatus.BAD_GATEWAY,
        { reason: err instanceof Error ? err.message : String(err) },
      );
    }
    const data = {
      providerAccountId: created.accountId,
      status: created.status,
      statusReason: created.reason ?? null,
      beneficiaryName: input.beneficiaryName.trim(),
      bankLast4: input.accountNumber.slice(-4),
      ifsc: input.ifsc,
      panLast4: input.pan.slice(-4),
      email: input.email,
    };
    const saved = await this.prisma.payoutAccount.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    if (saved.status === 'ACTIVATED') await this.sendWaiting(userId);
    return present(saved);
  }

  /** Razorpay says the account's state changed. */
  async accountChanged(
    providerAccountId: string,
    status: PayoutAccount['status'],
    reason?: string,
  ): Promise<void> {
    const a = await this.prisma.payoutAccount.findUnique({ where: { providerAccountId } });
    if (!a) return;
    await this.prisma.payoutAccount.update({
      where: { id: a.id },
      data: { status, statusReason: reason ?? null },
    });
    if (status === 'ACTIVATED') await this.sendWaiting(a.userId);
  }

  // ── Transfers ──

  /** A booking was paid: owe the lender rent less commission, held until the return. */
  async onConfirmed(bookingId: string): Promise<void> {
    const b = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { payments: { where: { status: 'CAPTURED' }, take: 1 } },
    });
    const payment = b.payments[0];
    if (!payment) return;
    const transfer = await this.prisma.transfer.create({
      data: {
        bookingId,
        lenderId: b.lenderId,
        paymentId: payment.id,
        amountPaise: lenderShare(b.rentPaise, LISTING_RULES.commissionBps),
        onHold: true,
        status: 'AWAITING_ACCOUNT',
      },
    });
    await this.send(transfer.id);
  }

  /**
   * A paid booking was cancelled: take back the held transfer, and pay the
   * lender their share of any rent the borrower didn't get back.
   */
  async onCancelled(bookingId: string, rentRefundedPaise: number): Promise<void> {
    const b = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        transfers: {
          where: { onHold: true, status: { in: ['AWAITING_ACCOUNT', 'ON_HOLD', 'FAILED'] } },
        },
        payments: {
          where: { status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
          take: 1,
        },
      },
    });
    for (const t of b.transfers) await this.reverse(t);
    const kept = b.rentPaise - rentRefundedPaise;
    const payment = b.payments[0];
    if (kept > 0 && payment) {
      const share = await this.prisma.transfer.create({
        data: {
          bookingId,
          lenderId: b.lenderId,
          paymentId: payment.id,
          amountPaise: lenderShare(kept, LISTING_RULES.commissionBps),
          onHold: false,
          status: 'AWAITING_ACCOUNT',
        },
      });
      await this.send(share.id);
    }
  }

  /** Sends a transfer if the lender's account is active (first try or a retry). */
  async send(transferId: string): Promise<Transfer> {
    const t = await this.prisma.transfer.findUniqueOrThrow({
      where: { id: transferId },
      include: { payment: true, lender: { include: { payoutAccount: true } } },
    });
    const account = t.lender.payoutAccount;
    if (!account || account.status !== 'ACTIVATED' || !account.providerAccountId) {
      return this.prisma.transfer.update({
        where: { id: t.id },
        data: { status: 'AWAITING_ACCOUNT' },
      });
    }
    const claimed = await this.prisma.transfer.updateMany({
      where: {
        id: t.id,
        providerTransferId: null,
        status: { in: ['AWAITING_ACCOUNT', 'FAILED'] },
        attempts: t.attempts,
      },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return this.prisma.transfer.findUniqueOrThrow({ where: { id: t.id } });
    let created;
    try {
      created = await this.provider.createTransfer({
        paymentId: t.payment.paymentId!,
        accountId: account.providerAccountId,
        amountPaise: t.amountPaise,
        onHold: t.onHold,
        notes: { bookingId: t.bookingId, transferId: t.id },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Transfer ${t.id} failed: ${message}`);
      return this.prisma.transfer.update({
        where: { id: t.id },
        data: { status: 'FAILED', failureReason: message.slice(0, 500) },
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.transfer.update({
        where: { id: t.id },
        data: {
          providerTransferId: created.transferId,
          status: t.onHold ? 'ON_HOLD' : 'RELEASED',
          failureReason: null,
        },
      });
      await this.ledger.post(
        tx,
        { type: 'TRANSFER', bookingId: t.bookingId, externalRef: created.transferId },
        transferPostings(t.amountPaise),
      );
      return saved;
    });
  }

  /** Takes back a held transfer (or drops one that was never sent). */
  private async reverse(t: Transfer): Promise<void> {
    if (!t.providerTransferId) {
      await this.prisma.transfer.update({ where: { id: t.id }, data: { status: 'REVERSED' } });
      return;
    }
    try {
      await this.provider.reverseTransfer(t.providerTransferId, t.amountPaise);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Reversing transfer ${t.id} failed: ${message}`);
      await this.prisma.transfer.update({
        where: { id: t.id },
        data: { failureReason: `Reversal failed: ${message}`.slice(0, 500) },
      });
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.transfer.update({
        where: { id: t.id },
        data: { status: 'REVERSED', failureReason: null },
      });
      await this.ledger.post(
        tx,
        { type: 'TRANSFER_REVERSAL', bookingId: t.bookingId, externalRef: t.providerTransferId },
        reversalPostings(t.amountPaise),
      );
    });
  }

  /** Transfers that waited for this lender's account go out now. */
  private async sendWaiting(lenderId: string): Promise<void> {
    const waiting = await this.prisma.transfer.findMany({
      where: { lenderId, status: 'AWAITING_ACCOUNT' },
      select: { id: true },
    });
    for (const { id } of waiting) await this.send(id);
  }

  /**
   * Safety net: retries failed transfers, and reversals that failed on
   * cancelled bookings.
   */
  async retryFailed(): Promise<number> {
    const [failed, stuck] = await Promise.all([
      this.prisma.transfer.findMany({
        where: { status: 'FAILED', providerTransferId: null, attempts: { lt: MAX_ATTEMPTS } },
        select: { id: true },
        take: 100,
      }),
      this.prisma.transfer.findMany({
        where: { status: 'ON_HOLD', booking: { status: { in: ['CANCELLED', 'EXPIRED'] } } },
        take: 100,
      }),
    ]);
    for (const { id } of failed) await this.send(id);
    for (const t of stuck) await this.reverse(t);
    return failed.length + stuck.length;
  }

  /** Admin: try a failed transfer again now (resets the attempt count). */
  async retry(transferId: string): Promise<Transfer> {
    await this.prisma.transfer.updateMany({
      where: { id: transferId, status: 'FAILED' },
      data: { attempts: 0 },
    });
    return this.send(transferId);
  }

  // ── Earnings ──

  async earnings(userId: string): Promise<EarningsDto> {
    const [account, transfers] = await Promise.all([
      this.account(userId),
      this.prisma.transfer.findMany({
        where: { lenderId: userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          booking: {
            select: { startsOn: true, endsOn: true, listing: { select: { title: true } } },
          },
        },
      }),
    ]);
    const sum = (f: (t: Transfer) => boolean) =>
      transfers.filter(f).reduce((s, t) => s + t.amountPaise, 0);
    return {
      account,
      totals: {
        onHoldPaise: sum((t) => t.status === 'ON_HOLD'),
        paidPaise: sum((t) => t.status === 'RELEASED'),
        awaitingAccountPaise: sum((t) => t.status === 'AWAITING_ACCOUNT' || t.status === 'FAILED'),
      },
      items: transfers.map((t) => ({
        bookingId: t.bookingId,
        listingTitle: t.booking.listing.title,
        startDate: isoDate(t.booking.startsOn),
        endDate: isoDate(t.booking.endsOn),
        amountPaise: t.amountPaise,
        status: t.status,
        onHold: t.onHold,
        createdAt: t.createdAt,
      })),
    };
  }
}

function present(a: PayoutAccount): PayoutAccountDto {
  return {
    status: a.status,
    statusReason: a.statusReason,
    beneficiaryName: a.beneficiaryName,
    bankLast4: a.bankLast4,
    ifsc: a.ifsc,
    panLast4: a.panLast4,
  };
}
