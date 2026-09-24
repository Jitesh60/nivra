import { HttpStatus, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RateLimiter } from '../../redis/rate-limiter.js';
import { heldRanges } from '../bookings/availability.js';
import { mapBookingError } from '../bookings/booking-state-machine.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { LISTING_RULES, todayUtc } from '../listings/listing-rules.js';
import { quote } from '../listings/pricing.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { checkDates } from '../search/search.service.js';
import { BlocksService } from '../safety/blocks.service.js';
import { ChatPresenter, dateRange, type OfferRow, rupees } from './chat-presenter.js';
import { ConversationsService, type Participants } from './conversations.service.js';
import type { CreateOfferDto, MessageDto, OfferDto } from './dto/chat.dto.js';
import { ChatEvent, MESSAGES_PER_MINUTE, MessagesService, otherParty } from './messages.service.js';
import { effectiveStatus, offerExpiresAt, offerRent } from './offer-rules.js';

/**
 * Offers in chat: dates plus a price per day. One open offer per chat (a new
 * offer or a counter replaces it); only the other person can accept or
 * decline. Accepting creates the booking (already accepted by both).
 */
@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly presenter: ChatPresenter,
    private readonly blocks: BlocksService,
    private readonly limiter: RateLimiter,
    private readonly realtime: RealtimeService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Bookings depend on chat, so chat looks the service up lazily instead of importing its module. */
  private bookings(): BookingsService {
    return this.moduleRef.get(BookingsService, { strict: false });
  }

  /** A new offer in a chat; any open one becomes COUNTERED. */
  async create(conversationId: string, userId: string, dto: CreateOfferDto): Promise<MessageDto> {
    const c = await this.conversations.participants(conversationId, userId);
    return this.propose(c, userId, dto, null);
  }

  /** Answers the other person's open offer with different dates or price. */
  async counter(offerId: string, userId: string, dto: CreateOfferDto): Promise<MessageDto> {
    const { offer, c } = await this.respondable(offerId, userId);
    return this.propose(c, userId, dto, offer.id);
  }

  async accept(offerId: string, userId: string): Promise<OfferDto> {
    const { offer, c } = await this.respondable(offerId, userId);
    const listing = await this.listingFor(c.listingId);
    if (listing.status !== 'LIVE') {
      throw new AppException(
        ErrorCode.OFFER_DATES_UNAVAILABLE,
        'This listing isn’t available right now',
        HttpStatus.CONFLICT,
        { reason: 'NOT_LIVE' },
      );
    }
    this.assertBookable(listing, offer.startsOn, offer.endsOn);
    const bookings = this.bookings();
    await bookings.assertNoOpenBooking(c.listingId, c.borrowerId);

    const now = new Date();
    let accepted;
    try {
      accepted = await this.prisma.$transaction(async (tx) => {
        // One agreed deal per chat: an earlier one is replaced.
        const previous = await tx.offer.findMany({
          where: { conversationId: c.id, status: 'ACCEPTED' },
        });
        await tx.offer.updateMany({
          where: { conversationId: c.id, status: 'ACCEPTED' },
          data: { status: 'SUPERSEDED' },
        });
        const updated = await tx.offer.update({
          where: { id: offer.id },
          data: { status: 'ACCEPTED', respondedAt: now },
        });
        // Both people agreed, so the booking starts out accepted.
        const booking = await bookings.createFromOffer(tx, updated, c, userId);
        const next =
          booking.status === 'AWAITING_DOCS'
            ? 'Booking created: waiting for the borrower to share documents.'
            : 'Booking created: the dates are held for payment.';
        const system = await this.messages.post(
          c,
          userId,
          {
            type: 'SYSTEM',
            body: `Offer accepted: ${dateRange(updated.startsOn, updated.endsOn)} at ${rupees(updated.pricePerDayPaise)}/day. ${next}`,
          },
          tx,
        );
        return { updated, previous, system, booking };
      });
    } catch (err) {
      throw mapBookingError(err);
    }
    await this.announce(c, [
      accepted.updated,
      ...accepted.previous.map((p) => ({ ...p, status: 'SUPERSEDED' as const })),
    ]);
    await this.conversations.touch(c.id, accepted.system.body!, accepted.system.createdAt);
    await this.messages.broadcast(c, accepted.system);
    await bookings.afterOfferBooking(accepted.booking, userId);
    return this.presenter.offer(accepted.updated, userId);
  }

  async decline(offerId: string, userId: string): Promise<OfferDto> {
    const { offer, c } = await this.respondable(offerId, userId);
    const { updated, system } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.offer.update({
        where: { id: offer.id },
        data: { status: 'DECLINED', respondedAt: new Date() },
      });
      const system = await this.messages.post(
        c,
        userId,
        { type: 'SYSTEM', body: 'Offer declined' },
        tx,
      );
      return { updated, system };
    });
    await this.announce(c, [updated]);
    await this.conversations.touch(c.id, system.body!, system.createdAt);
    await this.messages.broadcast(c, system);
    return this.presenter.offer(updated, userId);
  }

  private async propose(
    c: Participants,
    userId: string,
    dto: CreateOfferDto,
    parentOfferId: string | null,
  ): Promise<MessageDto> {
    await this.blocks.assertNotBlocked(userId, otherParty(c, userId));
    const R = LISTING_RULES.pricePerDayPaise;
    if (dto.pricePerDayPaise < R.min || dto.pricePerDayPaise > R.max) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Request validation failed',
        HttpStatus.BAD_REQUEST,
        {
          pricePerDayPaise: [`must be between ${R.min} and ${R.max}`],
        },
      );
    }
    const dates = checkDates(dto)!;
    const listing = await this.listingFor(c.listingId);
    this.assertBookable(listing, dates.startDate, dates.endDate);
    await this.limiter.hit({
      key: `chat:send:${userId}`,
      limit: MESSAGES_PER_MINUTE,
      windowSec: 60,
      message: 'You’re sending messages too quickly. Wait a moment and try again.',
    });

    const now = new Date();
    let result: { replaced: OfferRow[]; message: Awaited<ReturnType<MessagesService['post']>> };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        // The open offer (if any) is answered by this one.
        const open = await tx.offer.findMany({
          where: { conversationId: c.id, status: 'PENDING' },
        });
        const replaced: OfferRow[] = [];
        for (const o of open) {
          const status = effectiveStatus(o, now) === 'EXPIRED' ? 'EXPIRED' : 'COUNTERED';
          replaced.push(
            await tx.offer.update({
              where: { id: o.id },
              data: { status, respondedAt: status === 'COUNTERED' ? now : null },
            }),
          );
        }
        const offer = await tx.offer.create({
          data: {
            conversationId: c.id,
            proposedById: userId,
            startsOn: dates.startDate,
            endsOn: dates.endDate,
            days: dates.days,
            pricePerDayPaise: dto.pricePerDayPaise,
            rentPaise: offerRent(dto.pricePerDayPaise, dates.days),
            depositPaise: listing.depositPaise,
            parentOfferId,
            expiresAt: offerExpiresAt(now, dates.startDate),
          },
        });
        const message = await this.messages.post(
          c,
          userId,
          { type: 'OFFER', offerId: offer.id },
          tx,
        );
        return { replaced, message };
      });
    } catch (err) {
      // Both people made an offer at the same moment; the other one won.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(
          ErrorCode.OFFER_NOT_PENDING,
          'A new offer just arrived. Take a look before sending yours.',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
    await this.announce(c, result.replaced);
    const preview = `Offer: ${rupees(dto.pricePerDayPaise)}/day, ${dateRange(dates.startDate, dates.endDate)}`;
    await this.conversations.touch(c.id, preview, result.message.createdAt);
    await this.messages.broadcast(c, result.message);
    return this.presenter.message(result.message, userId);
  }

  /** An offer the user can answer: open, not expired, and made by the other person. */
  private async respondable(offerId: string, userId: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw notFound();
    const c = await this.conversations.participants(offer.conversationId, userId).catch(() => {
      throw notFound();
    });
    const status = effectiveStatus(offer);
    if (status === 'EXPIRED') {
      if (offer.status === 'PENDING') {
        const expired = await this.prisma.offer.update({
          where: { id: offer.id },
          data: { status: 'EXPIRED' },
        });
        await this.announce(c, [expired]);
      }
      throw new AppException(
        ErrorCode.OFFER_EXPIRED,
        'This offer has expired',
        HttpStatus.CONFLICT,
      );
    }
    if (status !== 'PENDING') {
      throw new AppException(
        ErrorCode.OFFER_NOT_PENDING,
        'This offer has already been answered',
        HttpStatus.CONFLICT,
        { status },
      );
    }
    if (offer.proposedById === userId) {
      throw new AppException(
        ErrorCode.OFFER_OWN,
        'You can’t answer your own offer',
        HttpStatus.FORBIDDEN,
      );
    }
    await this.blocks.assertNotBlocked(userId, otherParty(c, userId));
    return { offer, c };
  }

  /** The listing's rules and unavailable dates (its blocks plus held bookings). */
  private async listingFor(listingId: string) {
    const [listing, held] = await Promise.all([
      this.listingRow(listingId),
      heldRanges(this.prisma, listingId),
    ]);
    return { ...listing, blocks: [...listing.blocks, ...held] };
  }

  private listingRow(listingId: string) {
    return this.prisma.listing.findUniqueOrThrow({
      where: { id: listingId },
      select: {
        status: true,
        pricePerDayPaise: true,
        weeklyDiscountPct: true,
        depositPaise: true,
        minDays: true,
        maxDays: true,
        advanceNoticeDays: true,
        blocks: { select: { startsOn: true, endsOn: true } },
      },
    });
  }

  /** The listing's own rules still apply to negotiated dates. */
  private assertBookable(
    listing: Awaited<ReturnType<OffersService['listingFor']>>,
    start: Date,
    end: Date,
  ): void {
    const q = quote(listing, start, end, todayUtc());
    if (!q.available) {
      throw new AppException(
        ErrorCode.OFFER_DATES_UNAVAILABLE,
        REASON_MESSAGES[q.unavailableReason!],
        HttpStatus.CONFLICT,
        { reason: q.unavailableReason },
      );
    }
  }

  /** Tells both people an offer changed (each sees `mine` from their side). */
  private async announce(c: Participants, offers: OfferRow[]): Promise<void> {
    for (const o of offers) {
      for (const userId of [c.borrowerId, c.lenderId]) {
        this.realtime.toUser(userId, ChatEvent.OFFER_UPDATED, this.presenter.offer(o, userId));
      }
    }
  }
}

const REASON_MESSAGES = {
  BLOCKED: 'The lender has blocked some of these dates.',
  TOO_SHORT: 'That’s shorter than the minimum rental.',
  TOO_LONG: 'That’s longer than the maximum rental.',
  NOT_ENOUGH_NOTICE: 'The lender needs more notice before pickup.',
} as const;

function notFound(): AppException {
  return new AppException(ErrorCode.NOT_FOUND, 'Offer not found', HttpStatus.NOT_FOUND);
}
