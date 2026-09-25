import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { Offer, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RateLimiter } from '../../redis/rate-limiter.js';
import { AuditService } from '../audit/audit.service.js';
import { holdCredit } from '../referrals/credits.js';
import { assertVerified } from '../auth/verified.guard.js';
import { ConversationsService } from '../chat/conversations.service.js';
import { todayUtc } from '../listings/listing-rules.js';
import { BORROWER_FEE_BPS, quote } from '../listings/pricing.js';
import { BlocksService } from '../safety/blocks.service.js';
import { checkDates } from '../search/search.service.js';
import { heldRanges } from './availability.js';
import {
  bookingDetailInclude,
  bookingInclude,
  BookingPresenter,
  type BookingRow,
} from './booking-presenter.js';
import { deadlineFor, OPEN_STATUSES } from './booking-rules.js';
import {
  type ActorRef,
  bookingNotFound,
  BookingStateMachine,
  mapBookingError,
  type Transition,
} from './booking-state-machine.js';
import type {
  AdminBookingDetailDto,
  AdminBookingPageDto,
  AdminListBookingsQueryDto,
  BookingDetailDto,
  BookingPageDto,
  CreateBookingDto,
  ListBookingsQueryDto,
} from './dto/booking.dto.js';

export const BOOKING_REQUESTS_PER_DAY = 10;

const EXPIRABLE = ['REQUESTED', 'AWAITING_DOCS', 'AWAITING_PAYMENT'] as const;

const UNAVAILABLE_MESSAGES = {
  BLOCKED: 'Those dates aren’t available.',
  TOO_SHORT: 'That’s shorter than the minimum rental.',
  TOO_LONG: 'That’s longer than the maximum rental.',
  NOT_ENOUGH_NOTICE: 'The lender needs more notice before pickup.',
} as const;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly machine: BookingStateMachine,
    private readonly presenter: BookingPresenter,
    private readonly conversations: ConversationsService,
    private readonly blocks: BlocksService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
  ) {}

  // ── Borrower and lender ──

  /**
   * "Request to book" at the listed price. The lender has a day to reply;
   * other borrowers can still ask for the same dates until one is accepted.
   */
  async request(borrowerId: string, dto: CreateBookingDto): Promise<BookingDetailDto> {
    await assertVerified(this.prisma, borrowerId);
    const dates = checkDates(dto)!;
    const listing = await this.prisma.listing.findFirst({
      where: { id: dto.listingId, status: 'LIVE', deletedAt: null, lender: { status: 'ACTIVE' } },
      select: {
        id: true,
        lenderId: true,
        pricePerDayPaise: true,
        weeklyDiscountPct: true,
        depositPaise: true,
        minDays: true,
        maxDays: true,
        advanceNoticeDays: true,
        blocks: { select: { startsOn: true, endsOn: true } },
      },
    });
    if (!listing) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Listing not found', HttpStatus.NOT_FOUND);
    }
    if (listing.lenderId === borrowerId) {
      throw new AppException(
        ErrorCode.BOOKING_OWN_LISTING,
        'This is your own listing',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.blocks.assertNotBlocked(borrowerId, listing.lenderId);
    const held = await heldRanges(this.prisma, listing.id);
    const q = quote(
      { ...listing, blocks: [...listing.blocks, ...held] },
      dates.startDate,
      dates.endDate,
      todayUtc(),
    );
    if (!q.available) {
      throw new AppException(
        ErrorCode.BOOKING_DATES_UNAVAILABLE,
        UNAVAILABLE_MESSAGES[q.unavailableReason!],
        HttpStatus.CONFLICT,
        { reason: q.unavailableReason },
      );
    }
    await this.assertNoOpenBooking(listing.id, borrowerId);
    await this.limiter.hit({
      key: `booking:request:${borrowerId}`,
      limit: BOOKING_REQUESTS_PER_DAY,
      windowSec: 24 * 3600,
      message: 'You’ve sent a lot of booking requests today. Please try again tomorrow.',
    });
    const conversation = await this.conversations.start(borrowerId, listing.id);

    const now = new Date();
    let booking: BookingRow;
    try {
      booking = await this.prisma.$transaction(async (tx) => {
        const created = await tx.booking.create({
          data: {
            listingId: listing.id,
            borrowerId,
            lenderId: listing.lenderId,
            conversationId: conversation.id,
            source: 'REQUEST',
            startsOn: dates.startDate,
            endsOn: dates.endDate,
            days: q.days,
            pricePerDayPaise: q.pricePerDayPaise,
            rentPaise: q.rentPaise,
            feePaise: q.feePaise,
            depositPaise: q.depositPaise,
            totalPaise: q.totalPaise,
            status: 'REQUESTED',
            expiresAt: deadlineFor(
              {
                status: 'REQUESTED',
                requiresDocs: false,
                docsSubmitted: false,
                startsOn: dates.startDate,
              },
              now,
              this.machine.windows,
            ),
          },
        });
        // Referral credit comes off the rent (Phase 10).
        const credit = await holdCredit(tx, borrowerId, created.id, q.rentPaise);
        if (credit > 0) {
          await tx.booking.update({
            where: { id: created.id },
            data: { creditPaise: credit, totalPaise: q.totalPaise - credit },
          });
        }
        await tx.bookingEvent.create({
          data: {
            bookingId: created.id,
            type: 'REQUESTED',
            toStatus: 'REQUESTED',
            actorType: 'USER',
            actorId: borrowerId,
          },
        });
        return tx.booking.findUniqueOrThrow({
          where: { id: created.id },
          include: bookingInclude(),
        });
      });
    } catch (err) {
      throw mapBookingError(err);
    }
    await this.machine.afterChange({
      booking,
      event: 'REQUESTED',
      from: 'REQUESTED',
      actor: { party: 'BORROWER', id: borrowerId },
      note: null,
    });
    return this.get(booking.id, borrowerId);
  }

  /**
   * An offer accepted in chat becomes a booking that's already accepted (both
   * people agreed), at the agreed price. Runs inside the offer's transaction;
   * call [afterOfferBooking] once it commits.
   */
  async createFromOffer(
    tx: Prisma.TransactionClient,
    offer: Offer,
    conversation: { id: string; listingId: string; borrowerId: string; lenderId: string },
    acceptedById: string,
  ): Promise<BookingRow> {
    const requiredDocs = await tx.listingRequiredDoc.count({
      where: { listingId: conversation.listingId },
    });
    const status = requiredDocs > 0 ? 'AWAITING_DOCS' : 'AWAITING_PAYMENT';
    const rent = offer.rentPaise;
    const fee = Math.round((rent * BORROWER_FEE_BPS) / 10_000);
    const created = await tx.booking.create({
      data: {
        listingId: conversation.listingId,
        borrowerId: conversation.borrowerId,
        lenderId: conversation.lenderId,
        conversationId: conversation.id,
        offerId: offer.id,
        source: 'OFFER',
        startsOn: offer.startsOn,
        endsOn: offer.endsOn,
        days: offer.days,
        pricePerDayPaise: offer.pricePerDayPaise,
        rentPaise: rent,
        feePaise: fee,
        depositPaise: offer.depositPaise,
        totalPaise: rent + fee + offer.depositPaise,
        status,
        expiresAt: deadlineFor(
          {
            status,
            requiresDocs: requiredDocs > 0,
            docsSubmitted: false,
            startsOn: offer.startsOn,
          },
          new Date(),
          this.machine.windows,
        ),
      },
    });
    const credit = await holdCredit(tx, conversation.borrowerId, created.id, rent);
    if (credit > 0) {
      await tx.booking.update({
        where: { id: created.id },
        data: { creditPaise: credit, totalPaise: rent + fee + offer.depositPaise - credit },
      });
    }
    await tx.bookingEvent.create({
      data: {
        bookingId: created.id,
        type: 'ACCEPTED',
        toStatus: status,
        actorType: 'USER',
        actorId: acceptedById,
        note: 'Offer agreed in chat',
      },
    });
    return tx.booking.findUniqueOrThrow({ where: { id: created.id }, include: bookingInclude() });
  }

  /** Timers, the apps and notifications for a booking made from an offer (chat already has its note). */
  async afterOfferBooking(booking: BookingRow, acceptedById: string): Promise<void> {
    const party = acceptedById === booking.borrowerId ? 'BORROWER' : 'LENDER';
    await this.machine.afterChange(
      {
        booking,
        event: 'ACCEPTED',
        from: 'REQUESTED',
        actor: { party, id: acceptedById },
        note: 'Offer agreed in chat',
      },
      { chatNote: false },
    );
  }

  /** Refuses a second booking while one is in progress for this borrower and listing. */
  async assertNoOpenBooking(listingId: string, borrowerId: string): Promise<void> {
    const open = await this.prisma.booking.count({
      where: { listingId, borrowerId, status: { in: [...OPEN_STATUSES] } },
    });
    if (open > 0) {
      throw new AppException(
        ErrorCode.BOOKING_OPEN_EXISTS,
        'You already have a booking in progress for this item.',
        HttpStatus.CONFLICT,
      );
    }
  }

  async accept(id: string, userId: string): Promise<BookingDetailDto> {
    await this.act(id, userId, 'LENDER', (actor) => this.machine.transition(id, 'accept', actor));
    return this.get(id, userId);
  }

  async decline(id: string, userId: string, reason?: string): Promise<BookingDetailDto> {
    await this.act(id, userId, 'LENDER', (actor) =>
      this.machine.transition(id, 'decline', actor, {
        note: reason,
        patch: { declineReason: reason?.trim() || null },
      }),
    );
    return this.get(id, userId);
  }

  async cancel(id: string, userId: string, reason: string): Promise<BookingDetailDto> {
    await this.act(id, userId, null, (actor) =>
      this.machine.transition(id, 'cancel', actor, {
        note: reason,
        patch: {
          cancelledBy: actor.party as 'BORROWER' | 'LENDER',
          cancelledById: userId,
          cancelReason: reason.trim(),
        },
      }),
    );
    return this.get(id, userId);
  }

  async list(userId: string, query: ListBookingsQueryDto): Promise<BookingPageDto> {
    const rows = await this.prisma.booking.findMany({
      where: {
        ...(query.role === 'BORROWER' ? { borrowerId: userId } : { lenderId: userId }),
        status: query.scope === 'OPEN' ? { in: [...OPEN_STATUSES] } : { notIn: [...OPEN_STATUSES] },
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: bookingInclude(),
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((b) => this.presenter.summary(b, userId)),
      nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
    };
  }

  async get(id: string, userId: string): Promise<BookingDetailDto> {
    const b = await this.prisma.booking.findUnique({
      where: { id },
      include: bookingDetailInclude(),
    });
    if (!b || (b.borrowerId !== userId && b.lenderId !== userId)) throw bookingNotFound();
    return this.presenter.detail(b, userId);
  }

  /** Whether the user is on either side of a booking still in progress (blocks account deletion). */
  async hasOpenBookings(userId: string): Promise<boolean> {
    const n = await this.prisma.booking.count({
      where: {
        OR: [{ borrowerId: userId }, { lenderId: userId }],
        status: { in: [...OPEN_STATUSES] },
      },
    });
    return n > 0;
  }

  // ── Timers ──

  /** Expires the booking if its current step has timed out (called by its delayed job). */
  async expireIfDue(id: string, now = new Date()): Promise<boolean> {
    try {
      // A returned booking's timer is the claim window: it completes instead.
      const current = await this.prisma.booking.findUnique({
        where: { id },
        select: { status: true },
      });
      if (current?.status === 'RETURNED') {
        const done = await this.machine.transition(
          id,
          'complete',
          { party: 'SYSTEM', id: null },
          {
            patch: { completedAt: now },
            onlyIf: (b) => b.status === 'RETURNED' && b.expiresAt !== null && b.expiresAt <= now,
          },
        );
        return done !== null;
      }
      const t = await this.machine.transition(
        id,
        'expire',
        { party: 'SYSTEM', id: null },
        {
          onlyIf: (b) =>
            (EXPIRABLE as readonly string[]).includes(b.status) &&
            b.expiresAt !== null &&
            b.expiresAt <= now,
        },
      );
      return t !== null;
    } catch (err) {
      // Deleted meanwhile: nothing to do.
      if (err instanceof AppException && err.code === ErrorCode.NOT_FOUND) return false;
      throw err;
    }
  }

  /** Safety net for lost delayed jobs: expires (or completes) everything past its deadline. */
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.prisma.booking.findMany({
      where: { status: { in: [...EXPIRABLE, 'RETURNED'] }, expiresAt: { lte: now } },
      select: { id: true },
      take: 500,
    });
    let expired = 0;
    for (const { id } of due) if (await this.expireIfDue(id, now)) expired++;
    return expired;
  }

  // ── Admin ──

  async adminList(query: AdminListBookingsQueryDto): Promise<AdminBookingPageDto> {
    const statuses =
      query.tab === 'OPEN'
        ? (['REQUESTED', 'AWAITING_DOCS'] as const)
        : query.tab === 'AWAITING_PAYMENT'
          ? (['AWAITING_PAYMENT'] as const)
          : query.tab === 'CONFIRMED'
            ? (['CONFIRMED', 'ACTIVE', 'RETURNED', 'DISPUTED'] as const)
            : (['DECLINED', 'EXPIRED', 'CANCELLED', 'COMPLETED'] as const);
    const q = query.q?.trim();
    const person = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { phone: { contains: q.replace(/\s+/g, '') } },
          ],
        }
      : null;
    const rows = await this.prisma.booking.findMany({
      where: {
        status: { in: [...statuses] },
        ...(q && person
          ? {
              OR: [
                { listing: { title: { contains: q, mode: 'insensitive' } } },
                { borrower: person },
                { lender: person },
              ],
            }
          : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: bookingInclude(),
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((b) => this.presenter.admin(b)),
      nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
    };
  }

  async adminGet(id: string): Promise<AdminBookingDetailDto> {
    const b = await this.prisma.booking.findUnique({
      where: { id },
      include: bookingDetailInclude(),
    });
    if (!b) throw bookingNotFound();
    const actorIds = [
      ...new Set([
        ...b.events.map((e) => e.actorId),
        ...b.shares.flatMap((s) => s.accessLogs.map((l) => l.viewerId)),
      ]),
    ].filter((x): x is string => !!x);
    const [users, admins, lenderCancellations] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      }),
      this.prisma.adminUser.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      }),
      this.prisma.booking.count({ where: { lenderId: b.lenderId, cancelledBy: 'LENDER' } }),
    ]);
    const names = new Map<string, string | null>([
      ...users.map((u) => [u.id, u.name] as const),
      ...admins.map((a) => [a.id, a.name] as const),
    ]);
    return this.presenter.adminDetail(b, { lenderCancellations, names });
  }

  async adminCancel(
    id: string,
    adminId: string,
    reason: string,
    client: ClientInfo,
  ): Promise<AdminBookingDetailDto> {
    const t = await this.machine.transition(
      id,
      'cancel',
      { party: 'ADMIN', id: adminId },
      {
        note: reason,
        patch: { cancelledBy: 'ADMIN', cancelledById: adminId, cancelReason: reason.trim() },
      },
    );
    await this.audit.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.booking.cancel',
      targetType: 'booking',
      targetId: id,
      metadata: { reason: reason.trim(), from: t!.from },
      ip: client.ip,
    });
    return this.adminGet(id);
  }

  /**
   * Runs [fn] as the user's side of the booking. [required] limits it to one
   * side; someone outside the booking gets a 404 (never reveal others' bookings).
   */
  private async act(
    id: string,
    userId: string,
    required: 'BORROWER' | 'LENDER' | null,
    fn: (actor: ActorRef) => Promise<Transition | null>,
  ): Promise<void> {
    const b = await this.prisma.booking.findUnique({
      where: { id },
      select: { borrowerId: true, lenderId: true, status: true },
    });
    if (!b || (b.borrowerId !== userId && b.lenderId !== userId)) throw bookingNotFound();
    const party = b.borrowerId === userId ? 'BORROWER' : 'LENDER';
    if (required && party !== required) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_ALLOWED,
        required === 'LENDER' ? 'Only the lender can do this' : 'Only the borrower can do this',
        HttpStatus.FORBIDDEN,
      );
    }
    await fn({ party, id: userId });
  }
}
