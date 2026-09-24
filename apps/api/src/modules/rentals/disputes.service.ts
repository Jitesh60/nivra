import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BookingPresenter, bookingDetailInclude } from '../bookings/booking-presenter.js';
import { bookingNotFound, BookingStateMachine } from '../bookings/booking-state-machine.js';
import { claimUntil, maxKeepable } from '../bookings/booking-rules.js';
import type {
  AdminDisputeDetailDto,
  AdminDisputeDto,
  AdminDisputePageDto,
  AdminDisputesQueryDto,
  DisputeResponseDto,
  OpenDisputeDto,
  ResolveDisputeDto,
} from '../bookings/dto/rental.dto.js';
import { rupees } from '../chat/chat-presenter.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { moved } from './handover.service.js';
import { RentalPhotos } from './rental-photos.js';

const listInclude = {
  booking: {
    select: {
      listing: { select: { title: true } },
      borrower: { select: { name: true } },
      lender: { select: { name: true } },
      depositPaise: true,
    },
  },
} satisfies Prisma.DisputeInclude;

/**
 * A lender's claim on the deposit: opened in the claim window (or when the
 * item is long overdue), answered once by the borrower, decided by an admin.
 */
@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly machine: BookingStateMachine,
    private readonly presenter: BookingPresenter,
    private readonly photos: RentalPhotos,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async open(bookingId: string, userId: string, dto: OpenDisputeDto): Promise<void> {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || (b.borrowerId !== userId && b.lenderId !== userId)) throw bookingNotFound();
    if (b.lenderId !== userId || !['ACTIVE', 'RETURNED'].includes(b.status)) throw moved(b.status);
    if (b.status === 'RETURNED' && b.returnedAt && new Date() >= claimUntil(b.returnedAt)) {
      throw new AppException(
        ErrorCode.DISPUTE_WINDOW_CLOSED,
        'The time to report a problem has passed.',
        HttpStatus.CONFLICT,
      );
    }
    // Before the return, the only claim is that it hasn't come back.
    if ((b.status === 'ACTIVE') !== (dto.reason === 'NOT_RETURNED')) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        b.status === 'ACTIVE'
          ? 'Until it’s returned, you can only report that the item wasn’t returned.'
          : 'The item was returned; choose another reason.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const max = maxKeepable(b.depositPaise, b.lateFeePaise);
    if (dto.claimPaise > max) throw keepTooLarge(max);

    const keys = await this.photos.store(userId, bookingId, 'dispute', dto.photoKeys);
    try {
      await this.machine.transition(
        bookingId,
        'openDispute',
        { party: 'LENDER', id: userId },
        {
          note: dto.description,
          inTx: async (tx) => {
            await tx.dispute.create({
              data: {
                bookingId,
                openedById: userId,
                reason: dto.reason,
                description: dto.description.trim(),
                claimPaise: dto.claimPaise,
                evidenceKeys: keys,
              },
            });
          },
        },
      );
    } catch (err) {
      await this.photos.remove(keys);
      throw err;
    }
  }

  /** The borrower's side, once. */
  async respond(bookingId: string, userId: string, dto: DisputeResponseDto): Promise<void> {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { dispute: true, listing: { select: { title: true } } },
    });
    if (!b || (b.borrowerId !== userId && b.lenderId !== userId)) throw bookingNotFound();
    const d = b.dispute;
    if (b.borrowerId !== userId || !d || d.status !== 'OPEN' || d.respondedAt) {
      throw moved(b.status);
    }
    const keys = await this.photos.store(userId, bookingId, 'dispute', dto.photoKeys);
    const updated = await this.prisma.dispute.updateMany({
      where: { id: d.id, status: 'OPEN', respondedAt: null },
      data: { responseNote: dto.note.trim(), responseKeys: keys, respondedAt: new Date() },
    });
    if (updated.count === 0) {
      await this.photos.remove(keys);
      throw moved(b.status);
    }
    await this.notifications.notify(
      b.lenderId,
      {
        type: 'booking.dispute_response',
        title: 'The borrower replied',
        body: `The borrower gave their side about ${b.listing.title}. Sajha will decide soon.`,
        bookingId,
      },
      { push: false },
    );
  }

  // ── Admin ──

  async list(query: AdminDisputesQueryDto): Promise<AdminDisputePageDto> {
    const rows = await this.prisma.dispute.findMany({
      where: {
        status: query.status,
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: listInclude,
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((d) => this.summary(d)),
      nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
    };
  }

  async get(id: string): Promise<AdminDisputeDetailDto> {
    const d = await this.prisma.dispute.findUnique({
      where: { id },
      include: { ...listInclude, resolvedBy: { select: { name: true } } },
    });
    if (!d) throw notFound();
    const b = await this.prisma.booking.findUniqueOrThrow({
      where: { id: d.bookingId },
      include: bookingDetailInclude(),
    });
    const reports = await this.presenter.conditionReports(b);
    return {
      ...this.summary(d),
      description: d.description,
      evidence: await this.presenter.photos(d.evidenceKeys),
      responseNote: d.responseNote,
      responsePhotos: await this.presenter.photos(d.responseKeys),
      respondedAt: d.respondedAt,
      keptPaise: d.keptPaise,
      resolutionNote: d.resolutionNote,
      resolvedByName: d.resolvedBy?.name ?? null,
      resolvedAt: d.resolvedAt,
      conversationId: b.conversationId,
      rental: this.presenter.rental(b)!,
      maxKeepPaise: maxKeepable(b.depositPaise, b.lateFeePaise),
      conditionReports: reports.map((r) => ({
        ...r,
        byName: r.by === 'BORROWER' ? b.borrower.name : b.lender.name,
      })),
    };
  }

  /** Decides how much of the deposit the lender keeps; the booking completes. */
  async resolve(
    id: string,
    adminId: string,
    dto: ResolveDisputeDto,
    client: ClientInfo,
  ): Promise<AdminDisputeDetailDto> {
    const d = await this.prisma.dispute.findUnique({
      where: { id },
      include: { booking: true },
    });
    if (!d) throw notFound();
    const b = d.booking;
    if (d.status !== 'OPEN') {
      throw new AppException(
        ErrorCode.BOOKING_INVALID_TRANSITION,
        'This dispute has already been decided.',
        HttpStatus.CONFLICT,
      );
    }
    const max = maxKeepable(b.depositPaise, b.lateFeePaise);
    if (dto.keptPaise > max) throw keepTooLarge(max);
    const now = new Date();
    const note = dto.note.trim();
    await this.machine.transition(
      b.id,
      'resolveDispute',
      { party: 'ADMIN', id: adminId },
      {
        note,
        patch: { completedAt: now, keptPaise: b.lateFeePaise + dto.keptPaise },
        inTx: async (tx) => {
          await tx.dispute.update({
            where: { id },
            data: {
              status: 'RESOLVED',
              keptPaise: dto.keptPaise,
              resolutionNote: note,
              resolvedById: adminId,
              resolvedAt: now,
            },
          });
        },
      },
    );
    await this.audit.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.dispute.resolve',
      targetType: 'booking',
      targetId: b.id,
      metadata: {
        disputeId: id,
        claimPaise: d.claimPaise,
        keptPaise: dto.keptPaise,
        note,
      },
      ip: client.ip,
    });
    return this.get(id);
  }

  private summary(d: Prisma.DisputeGetPayload<{ include: typeof listInclude }>): AdminDisputeDto {
    return {
      id: d.id,
      bookingId: d.bookingId,
      listingTitle: d.booking.listing.title,
      borrowerName: d.booking.borrower.name,
      lenderName: d.booking.lender.name,
      reason: d.reason,
      claimPaise: d.claimPaise,
      depositPaise: d.booking.depositPaise,
      status: d.status,
      responded: d.respondedAt !== null,
      createdAt: d.createdAt,
    };
  }
}

function keepTooLarge(max: number): AppException {
  return new AppException(
    ErrorCode.KEEP_TOO_LARGE,
    `At most ${rupees(max)} of the deposit is left to keep.`,
    HttpStatus.BAD_REQUEST,
    { maxPaise: max },
  );
}

function notFound(): AppException {
  return new AppException(ErrorCode.NOT_FOUND, 'Dispute not found', HttpStatus.NOT_FOUND);
}
