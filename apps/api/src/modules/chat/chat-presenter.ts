import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { OPEN_STATUSES } from '../bookings/booking-rules.js';
import { ParticipantPresenter } from '../safety/participants.js';
import { userViewInclude } from '../users/user-view.js';
import type { ConversationDto, MessageDto, OfferDto } from './dto/chat.dto.js';
import { effectiveStatus } from './offer-rules.js';

/** Chat photos are private: links are short-lived and only given to participants. */
export const CHAT_IMAGE_URL_TTL_SEC = 10 * 60;

export const conversationInclude = () =>
  ({
    listing: {
      select: {
        id: true,
        title: true,
        status: true,
        pricePerDayPaise: true,
        depositPaise: true,
        minDays: true,
        maxDays: true,
        photos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { thumbKey: true } },
      },
    },
    borrower: { include: userViewInclude() },
    lender: { include: userViewInclude() },
    offers: { where: { status: { in: ['PENDING', 'ACCEPTED'] } } },
    bookings: {
      where: { status: { in: [...OPEN_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { id: true },
    },
  }) satisfies Prisma.ConversationInclude;

export type ConversationRow = Prisma.ConversationGetPayload<{
  include: ReturnType<typeof conversationInclude>;
}>;
export type OfferRow = Prisma.OfferGetPayload<object>;
export type MessageRow = Prisma.MessageGetPayload<{ include: { offer: true } }>;

export interface ConversationExtras {
  unreadCount: number;
  blockedByMe: boolean;
  blockedByThem: boolean;
}

@Injectable()
export class ChatPresenter {
  constructor(
    private readonly storage: StorageService,
    private readonly participants: ParticipantPresenter,
  ) {}

  offer(o: OfferRow, viewerId: string, now = new Date()): OfferDto {
    return {
      id: o.id,
      conversationId: o.conversationId,
      proposedById: o.proposedById,
      mine: o.proposedById === viewerId,
      startDate: isoDate(o.startsOn),
      endDate: isoDate(o.endsOn),
      days: o.days,
      pricePerDayPaise: o.pricePerDayPaise,
      rentPaise: o.rentPaise,
      depositPaise: o.depositPaise,
      totalPaise: o.rentPaise + o.depositPaise,
      status: effectiveStatus(o, now),
      parentOfferId: o.parentOfferId,
      expiresAt: o.expiresAt,
      createdAt: o.createdAt,
    };
  }

  /**
   * The message as [viewerId] may see it. [revealed]: the booking is paid, so
   * contact details are no longer hidden from the other person.
   */
  async message(m: MessageRow, viewerId: string, revealed = false): Promise<MessageDto> {
    const mine = m.senderId === viewerId;
    const [imageUrl, thumbUrl] = await Promise.all([
      m.imageKey ? this.storage.presignGet(m.imageKey, CHAT_IMAGE_URL_TTL_SEC) : null,
      m.thumbKey ? this.storage.presignGet(m.thumbKey, CHAT_IMAGE_URL_TTL_SEC) : null,
    ]);
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      mine,
      type: m.type,
      // TEXT: the other person only ever gets the masked text. SYSTEM: written by us.
      body: m.type === 'TEXT' ? (mine || revealed ? m.body : m.maskedBody) : m.body,
      masked: revealed ? false : m.masked,
      imageUrl,
      thumbUrl,
      offer: m.offer ? this.offer(m.offer, viewerId) : null,
      clientId: mine ? m.clientId : null,
      readAt: m.readAt,
      createdAt: m.createdAt,
    };
  }

  conversation(c: ConversationRow, viewerId: string, extras: ConversationExtras): ConversationDto {
    const now = new Date();
    const isBorrower = c.borrowerId === viewerId;
    const pending = c.offers.find((o) => effectiveStatus(o, now) === 'PENDING') ?? null;
    const accepted = c.offers.find((o) => o.status === 'ACCEPTED') ?? null;
    const thumb = c.listing.photos[0]?.thumbKey;
    return {
      id: c.id,
      listing: {
        id: c.listing.id,
        title: c.listing.title,
        thumbUrl: thumb ? this.storage.publicUrl(thumb) : null,
        status: c.listing.status,
        pricePerDayPaise: c.listing.pricePerDayPaise,
        depositPaise: c.listing.depositPaise,
        minDays: c.listing.minDays,
        maxDays: c.listing.maxDays,
      },
      role: isBorrower ? 'BORROWER' : 'LENDER',
      other: this.participants.present(isBorrower ? c.lender : c.borrower),
      lastMessageAt: c.lastMessageAt,
      lastMessagePreview: c.lastMessagePreview,
      unreadCount: extras.unreadCount,
      blockedByMe: extras.blockedByMe,
      canMessage: !extras.blockedByMe && !extras.blockedByThem,
      pendingOffer: pending ? this.offer(pending, viewerId, now) : null,
      acceptedOffer: accepted ? this.offer(accepted, viewerId, now) : null,
      openBookingId: c.bookings[0]?.id ?? null,
    };
  }
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "12 Oct" / "12 Oct – 16 Oct" for previews and system messages. */
export function dateRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return start.getTime() === end.getTime() ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
