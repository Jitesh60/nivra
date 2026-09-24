import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PayoutsService } from '../payouts/payouts.service.js';
import type {
  AdminPaymentDetailDto,
  AdminPaymentDto,
  AdminPaymentPageDto,
  AdminPaymentsQueryDto,
  AdminPayoutsQueryDto,
  AdminTransferDto,
  AdminTransferPageDto,
  LedgerSummaryDto,
} from './dto/payment.dto.js';
import { LedgerService } from './ledger.service.js';
import { RefundsService } from './refunds.service.js';

const paymentInclude = {
  booking: {
    select: {
      listing: { select: { title: true } },
      borrower: { select: { name: true } },
    },
  },
  refunds: true,
} satisfies Prisma.PaymentInclude;
type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

const transferInclude = {
  lender: { select: { name: true } },
  booking: { select: { listing: { select: { title: true } } } },
} satisfies Prisma.TransferInclude;
type TransferRow = Prisma.TransferGetPayload<{ include: typeof transferInclude }>;

/** The admin finance screens: payments, refunds, payouts and the ledger. */
@Injectable()
export class AdminPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refunds: RefundsService,
    private readonly payouts: PayoutsService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminPaymentsQueryDto): Promise<AdminPaymentPageDto> {
    const q = query.q?.trim();
    const rows = await this.prisma.payment.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(q
          ? {
              OR: [
                { orderId: q },
                { paymentId: q },
                { booking: { listing: { title: { contains: q, mode: 'insensitive' } } } },
                { booking: { borrower: { name: { contains: q, mode: 'insensitive' } } } },
                { booking: { borrower: { phone: { contains: q.replace(/\s+/g, '') } } } },
              ],
            }
          : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: paymentInclude,
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(presentPayment),
      nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
    };
  }

  async get(id: string): Promise<AdminPaymentDetailDto> {
    const p = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        ...paymentInclude,
        booking: {
          select: {
            status: true,
            rentPaise: true,
            feePaise: true,
            depositPaise: true,
            listing: { select: { title: true } },
            borrower: { select: { name: true } },
          },
        },
      },
    });
    if (!p) throw new AppException(ErrorCode.NOT_FOUND, 'Payment not found', HttpStatus.NOT_FOUND);
    const [transfers, ledger, refundable] = await Promise.all([
      this.prisma.transfer.findMany({
        where: { paymentId: p.id },
        orderBy: { createdAt: 'asc' },
        include: transferInclude,
      }),
      this.prisma.ledgerEntry.findMany({
        where: { bookingId: p.bookingId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.refunds.refundable(p.id),
    ]);
    const adminIds = p.refunds.map((r) => r.adminId).filter((x): x is string => !!x);
    const admins = await this.prisma.adminUser.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, name: true },
    });
    return {
      ...presentPayment(p),
      bookingStatus: p.booking.status,
      refundablePaise: refundable,
      rentPaise: p.booking.rentPaise,
      feePaise: p.booking.feePaise,
      depositPaise: p.booking.depositPaise,
      refunds: p.refunds
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((r) => ({
          id: r.id,
          amountPaise: r.amountPaise,
          kind: r.kind,
          status: r.status,
          reason: r.reason,
          providerRefundId: r.providerRefundId,
          failureReason: r.failureReason,
          adminName: admins.find((a) => a.id === r.adminId)?.name ?? null,
          createdAt: r.createdAt,
        })),
      transfers: transfers.map(presentTransfer),
      ledger: ledger.map((l) => ({
        txnId: l.txnId,
        type: l.type,
        account: l.account,
        debitPaise: l.debitPaise,
        creditPaise: l.creditPaise,
        externalRef: l.externalRef,
        createdAt: l.createdAt,
      })),
    };
  }

  /** A goodwill refund (Sajha bears it), up to what's still refundable. */
  async refund(
    id: string,
    adminId: string,
    input: { amountPaise: number; reason: string },
    client: ClientInfo,
  ): Promise<AdminPaymentDetailDto> {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) throw new AppException(ErrorCode.NOT_FOUND, 'Payment not found', HttpStatus.NOT_FOUND);
    const refund = await this.refunds.create({
      paymentRowId: id,
      kind: 'MANUAL',
      amountPaise: input.amountPaise,
      reason: input.reason.trim(),
      adminId,
    });
    await this.audit.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.payment.refund',
      targetType: 'payment',
      targetId: id,
      metadata: {
        amountPaise: input.amountPaise,
        reason: input.reason.trim(),
        status: refund?.status ?? null,
      },
      ip: client.ip,
    });
    return this.get(id);
  }

  async transfers(query: AdminPayoutsQueryDto): Promise<AdminTransferPageDto> {
    const rows = await this.prisma.transfer.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: transferInclude,
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(presentTransfer),
      nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
    };
  }

  async retryTransfer(id: string, adminId: string, client: ClientInfo): Promise<AdminTransferDto> {
    const t = await this.prisma.transfer.findUnique({ where: { id } });
    if (!t) throw new AppException(ErrorCode.NOT_FOUND, 'Transfer not found', HttpStatus.NOT_FOUND);
    if (t.status !== 'FAILED') {
      throw new AppException(
        ErrorCode.PAYMENT_NOT_ALLOWED,
        'Only a failed transfer can be retried',
        HttpStatus.CONFLICT,
        { status: t.status },
      );
    }
    await this.payouts.retry(id);
    await this.audit.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.transfer.retry',
      targetType: 'transfer',
      targetId: id,
      ip: client.ip,
    });
    return presentTransfer(
      await this.prisma.transfer.findUniqueOrThrow({ where: { id }, include: transferInclude }),
    );
  }

  async ledgerSummary(): Promise<LedgerSummaryDto> {
    const [summary, withoutLedger, failedRefunds, failedTransfers, captured, refunded] =
      await Promise.all([
        this.ledger.summary(),
        this.prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM payments p
          WHERE p.status IN ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')
            AND NOT EXISTS (
              SELECT 1 FROM ledger_entries l
              WHERE l.type = 'PAYMENT_CAPTURED' AND l.external_ref = p.payment_id
            )`,
        this.prisma.refund.count({ where: { status: 'FAILED' } }),
        this.prisma.transfer.count({ where: { status: 'FAILED' } }),
        this.prisma.payment.aggregate({
          where: { status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
          _sum: { amountPaise: true },
        }),
        this.prisma.refund.aggregate({
          where: { providerRefundId: { not: null }, status: { not: 'FAILED' } },
          _sum: { amountPaise: true },
        }),
      ]);
    return {
      ...summary,
      capturedWithoutLedger: Number(withoutLedger[0]?.n ?? 0),
      failedRefunds,
      failedTransfers,
      capturedPaise: captured._sum.amountPaise ?? 0,
      refundedPaise: refunded._sum.amountPaise ?? 0,
    };
  }
}

function presentPayment(p: PaymentRow): AdminPaymentDto {
  return {
    id: p.id,
    bookingId: p.bookingId,
    listingTitle: p.booking.listing.title,
    borrowerName: p.booking.borrower.name,
    provider: p.provider,
    orderId: p.orderId,
    paymentId: p.paymentId,
    amountPaise: p.amountPaise,
    refundedPaise: p.refunds
      .filter((r) => r.status !== 'FAILED' && r.providerRefundId)
      .reduce((s, r) => s + r.amountPaise, 0),
    status: p.status,
    method: p.method,
    failureReason: p.failureReason,
    capturedAt: p.capturedAt,
    createdAt: p.createdAt,
  };
}

function presentTransfer(t: TransferRow): AdminTransferDto {
  return {
    id: t.id,
    bookingId: t.bookingId,
    lenderId: t.lenderId,
    lenderName: t.lender.name,
    listingTitle: t.booking.listing.title,
    amountPaise: t.amountPaise,
    onHold: t.onHold,
    status: t.status,
    providerTransferId: t.providerTransferId,
    failureReason: t.failureReason,
    attempts: t.attempts,
    createdAt: t.createdAt,
  };
}
