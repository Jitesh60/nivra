import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decrypt } from '../../common/crypto/crypto.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { ParticipantPresenter } from '../safety/participants.js';
import { userViewInclude } from '../users/user-view.js';
import {
  allowedActions,
  type BookingState,
  docTypesFor,
  isOpen,
  PAID_STATUSES,
} from './booking-rules.js';
import type {
  AdminBookingDetailDto,
  BookingPaymentDto,
  AdminBookingDto,
  BookingDetailDto,
  BookingDto,
  BookingRequiredDocDto,
} from './dto/booking.dto.js';

export const bookingInclude = () =>
  ({
    listing: {
      select: {
        id: true,
        title: true,
        areaLabel: true,
        photos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { thumbKey: true } },
        requiredDocs: { orderBy: { docType: 'asc' } },
        exactAddressEnc: true,
      },
    },
    borrower: { include: userViewInclude() },
    lender: { include: userViewInclude() },
    shares: { orderBy: { createdAt: 'asc' } },
  }) satisfies Prisma.BookingInclude;

export const bookingDetailInclude = () =>
  ({
    ...bookingInclude(),
    events: { orderBy: { createdAt: 'asc' } },
    payments: {
      orderBy: { createdAt: 'desc' },
      include: { refunds: { orderBy: { createdAt: 'asc' } } },
    },
    shares: {
      orderBy: { createdAt: 'asc' },
      include: { accessLogs: { orderBy: { createdAt: 'asc' } } },
    },
  }) satisfies Prisma.BookingInclude;

export type BookingRow = Prisma.BookingGetPayload<{ include: ReturnType<typeof bookingInclude> }>;
export type BookingDetailRow = Prisma.BookingGetPayload<{
  include: ReturnType<typeof bookingDetailInclude>;
}>;

/** What the rules need to know about a booking. */
export function stateOf(b: BookingRow): BookingState {
  return {
    status: b.status,
    requiresDocs: b.listing.requiredDocs.length > 0,
    docsSubmitted: b.shares.some((s) => s.status === 'SUBMITTED'),
  };
}

/** A short, human reference ("#4F2A9C"); the start of a v7 UUID is a timestamp, so use the end. */
export function bookingRef(id: string): string {
  return `#${id.replace(/-/g, '').slice(-6).toUpperCase()}`;
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class BookingPresenter {
  private readonly addressKey: Buffer;

  constructor(
    private readonly storage: StorageService,
    private readonly participants: ParticipantPresenter,
    config: ConfigService<Env, true>,
  ) {
    this.addressKey = Buffer.from(config.get('ADDRESS_ENC_KEY', { infer: true }), 'base64');
  }

  summary(b: BookingRow, viewerId: string): BookingDto {
    const isBorrower = b.borrowerId === viewerId;
    return {
      id: b.id,
      status: b.status,
      source: b.source,
      role: isBorrower ? 'BORROWER' : 'LENDER',
      listing: this.listing(b),
      other: this.participants.present(isBorrower ? b.lender : b.borrower),
      conversationId: b.conversationId,
      startDate: isoDate(b.startsOn),
      endDate: isoDate(b.endsOn),
      days: b.days,
      pricePerDayPaise: b.pricePerDayPaise,
      rentPaise: b.rentPaise,
      feePaise: b.feePaise,
      depositPaise: b.depositPaise,
      totalPaise: b.totalPaise,
      expiresAt: b.expiresAt,
      declineReason: b.declineReason,
      cancelledBy: b.cancelledBy,
      cancelReason: b.cancelReason,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  }

  detail(b: BookingDetailRow, viewerId: string, now = new Date()): BookingDetailDto {
    const isBorrower = b.borrowerId === viewerId;
    const lenderName = b.lender.name;
    return {
      ...this.summary(b, viewerId),
      payment: this.payment(b),
      // The exact address is for the borrower, once they've paid.
      pickupAddress:
        isBorrower &&
        (PAID_STATUSES as readonly string[]).includes(b.status) &&
        b.listing.exactAddressEnc
          ? decrypt(b.listing.exactAddressEnc, this.addressKey)
          : null,
      requiredDocs: this.requiredDocs(b),
      sharedDocuments: b.shares.map((s) => ({
        id: s.id,
        requiredDocId: s.requiredDocId,
        docType: s.docType,
        label: s.label,
        verified: s.verified,
        status: s.status,
        hasBack: s.backKey !== null,
        viewable:
          !isBorrower &&
          s.frontKey !== null &&
          s.purgedAt === null &&
          (s.accessExpiresAt === null || s.accessExpiresAt > now),
        // The borrower sees every time their document was opened.
        views: isBorrower
          ? s.accessLogs.map((l) => ({
              viewerName: l.viewerType === 'USER' ? lenderName : 'Sajha',
              at: l.createdAt,
            }))
          : [],
      })),
      events: b.events.map((e) => ({
        type: e.type,
        status: e.toStatus,
        by:
          e.actorType === 'SYSTEM'
            ? 'SYSTEM'
            : e.actorType === 'ADMIN'
              ? 'ADMIN'
              : e.actorId === b.borrowerId
                ? 'BORROWER'
                : 'LENDER',
        note: e.note,
        at: e.createdAt,
      })),
      can: allowedActions(isBorrower ? 'BORROWER' : 'LENDER', stateOf(b)),
    };
  }

  admin(b: BookingRow): AdminBookingDto {
    return {
      id: b.id,
      status: b.status,
      source: b.source,
      listing: this.listing(b),
      borrower: { id: b.borrower.id, name: b.borrower.name, phone: b.borrower.phone },
      lender: { id: b.lender.id, name: b.lender.name, phone: b.lender.phone },
      startDate: isoDate(b.startsOn),
      endDate: isoDate(b.endsOn),
      days: b.days,
      totalPaise: b.totalPaise,
      expiresAt: b.expiresAt,
      createdAt: b.createdAt,
    };
  }

  adminDetail(
    b: BookingDetailRow,
    extras: { lenderCancellations: number; names: Map<string, string | null> },
  ): AdminBookingDetailDto {
    const name = (id: string | null) => (id ? (extras.names.get(id) ?? null) : null);
    return {
      ...this.admin(b),
      conversationId: b.conversationId,
      pricePerDayPaise: b.pricePerDayPaise,
      rentPaise: b.rentPaise,
      feePaise: b.feePaise,
      depositPaise: b.depositPaise,
      declineReason: b.declineReason,
      cancelledBy: b.cancelledBy,
      cancelReason: b.cancelReason,
      closedAt: b.closedAt,
      lenderCancellations: extras.lenderCancellations,
      requiredDocs: this.requiredDocs(b),
      sharedDocuments: b.shares.map((s) => ({
        id: s.id,
        docType: s.docType,
        label: s.label,
        verified: s.verified,
        status: s.status,
        accessExpiresAt: s.accessExpiresAt,
        purgedAt: s.purgedAt,
        views: s.accessLogs.map((l) => ({
          viewerName: name(l.viewerId),
          viewerType: l.viewerType,
          ip: l.ip,
          at: l.createdAt,
        })),
      })),
      events: b.events.map((e) => ({
        type: e.type,
        status: e.toStatus,
        by:
          e.actorType === 'SYSTEM'
            ? 'SYSTEM'
            : e.actorType === 'ADMIN'
              ? 'ADMIN'
              : e.actorId === b.borrowerId
                ? 'BORROWER'
                : 'LENDER',
        actorName: name(e.actorId),
        note: e.note,
        at: e.createdAt,
      })),
      cancellable: isOpen(b.status),
    };
  }

  /** The payment that counts: a captured one if any, else the latest attempt. */
  payment(b: BookingDetailRow): BookingPaymentDto | null {
    const p =
      b.payments.find((x) => x.status !== 'CREATED' && x.status !== 'FAILED') ?? b.payments[0];
    if (!p) return null;
    const refunds = p.refunds.filter((r) => r.status !== 'FAILED');
    return {
      status: p.status,
      amountPaise: p.amountPaise,
      method: p.method,
      paidAt: p.capturedAt,
      refundedPaise: refunds.reduce((s, r) => s + r.amountPaise, 0),
      refunds: p.refunds.map((r) => ({
        amountPaise: r.amountPaise,
        kind: r.kind,
        status: r.status,
        createdAt: r.createdAt,
      })),
    };
  }

  private listing(b: BookingRow) {
    const thumb = b.listing.photos[0]?.thumbKey;
    return {
      id: b.listing.id,
      title: b.listing.title,
      thumbUrl: thumb ? this.storage.publicUrl(thumb) : null,
      areaLabel: b.listing.areaLabel,
    };
  }

  private requiredDocs(b: BookingRow): BookingRequiredDocDto[] {
    return b.listing.requiredDocs.map((d) => {
      const accepts = docTypesFor(d.docType);
      return {
        id: d.id,
        docType: d.docType,
        note: d.note,
        accepts: accepts === 'ANY' ? [] : accepts,
      };
    });
  }
}
