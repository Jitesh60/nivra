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
  claimUntil,
  docTypesFor,
  lateDaysFor,
  lateFeeFor,
  nextStatus,
  PAID_STATUSES,
  rentalEnd,
  REVIEW_WINDOW_DAYS,
} from './booking-rules.js';
import type {
  AdminBookingDetailDto,
  BookingPaymentDto,
  AdminBookingDto,
  BookingDetailDto,
  BookingDto,
  BookingRequiredDocDto,
} from './dto/booking.dto.js';
import type {
  BookingReviewsDto,
  ConditionReportDto,
  DisputeDto,
  PhotoDto,
  RentalDto,
  ReviewDto,
} from './dto/rental.dto.js';

/** Condition photos and evidence links last this long. */
export const PHOTO_URL_TTL_SEC = 600;

/** Each photo is stored as `<key>.webp` with a `<key>-thumb.webp` next to it. */
export const thumbKeyOf = (key: string) => key.replace(/\.webp$/, '-thumb.webp');
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
    conditionReports: { orderBy: [{ stage: 'asc' }, { createdAt: 'asc' }] },
    dispute: true,
    reviews: true,
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
    startsOn: b.startsOn,
    endsOn: b.endsOn,
    returnedAt: b.returnedAt,
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
      creditPaise: b.creditPaise,
      totalPaise: b.totalPaise,
      expiresAt: b.expiresAt,
      declineReason: b.declineReason,
      cancelledBy: b.cancelledBy,
      cancelReason: b.cancelReason,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  }

  async detail(b: BookingDetailRow, viewerId: string, now = new Date()): Promise<BookingDetailDto> {
    const isBorrower = b.borrowerId === viewerId;
    const lenderName = b.lender.name;
    const reviews = this.reviews(b, viewerId, now);
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
      can: {
        ...allowedActions(isBorrower ? 'BORROWER' : 'LENDER', stateOf(b), now),
        respond: isBorrower && b.dispute?.status === 'OPEN' && b.dispute.respondedAt === null,
        review: reviews.canReview,
      },
      rental: this.rental(b, now),
      conditionReports: await this.conditionReports(b),
      dispute: b.dispute ? await this.dispute(b.dispute) : null,
      reviews: reviews.dto,
    };
  }

  /** Handover, return and the late fee, once the booking is paid (or was a no-show). */
  rental(b: BookingRow, now = new Date()): RentalDto | null {
    if (!(PAID_STATUSES as readonly string[]).includes(b.status) && !b.noShowAt) return null;
    // While the item is still out, show the late fee so far.
    const out = b.status === 'ACTIVE' || (b.status === 'DISPUTED' && !b.returnedAt);
    const lateDays = out ? lateDaysFor(b.endsOn, now) : b.lateDays;
    return {
      handedOverAt: b.handedOverAt,
      dueAt: rentalEnd(b.endsOn),
      returnedAt: b.returnedAt,
      claimUntil: b.returnedAt ? claimUntil(b.returnedAt) : null,
      lateDays,
      lateFeePaise: out ? lateFeeFor(lateDays, b.pricePerDayPaise, b.depositPaise) : b.lateFeePaise,
      keptPaise: b.keptPaise,
      completedAt: b.completedAt,
      noShowAt: b.noShowAt,
    };
  }

  async photos(keys: string[]): Promise<PhotoDto[]> {
    return Promise.all(
      keys.map(async (key) => ({
        url: await this.storage.presignGet(key, PHOTO_URL_TTL_SEC),
        thumbUrl: await this.storage.presignGet(thumbKeyOf(key), PHOTO_URL_TTL_SEC),
      })),
    );
  }

  async conditionReports(b: BookingDetailRow): Promise<ConditionReportDto[]> {
    return Promise.all(
      b.conditionReports.map(async (r) => ({
        stage: r.stage,
        by: r.byUserId === b.borrowerId ? 'BORROWER' : 'LENDER',
        photos: await this.photos(r.photoKeys),
        note: r.note,
        at: r.createdAt,
      })),
    );
  }

  async dispute(d: NonNullable<BookingDetailRow['dispute']>): Promise<DisputeDto> {
    return {
      reason: d.reason,
      description: d.description,
      claimPaise: d.claimPaise,
      evidence: await this.photos(d.evidenceKeys),
      responseNote: d.responseNote,
      responsePhotos: await this.photos(d.responseKeys),
      respondedAt: d.respondedAt,
      status: d.status,
      keptPaise: d.keptPaise,
      resolutionNote: d.resolutionNote,
      resolvedAt: d.resolvedAt,
      createdAt: d.createdAt,
    };
  }

  /** Double-blind: the other person's review only once it's published. */
  private reviews(
    b: BookingDetailRow,
    viewerId: string,
    now: Date,
  ): { dto: BookingReviewsDto; canReview: boolean } {
    const present = (r: BookingDetailRow['reviews'][number]): ReviewDto => ({
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      publishedAt: r.publishedAt,
    });
    const mine = b.reviews.find((r) => r.authorId === viewerId);
    const theirs = b.reviews.find((r) => r.authorId !== viewerId && r.publishedAt !== null);
    const reviewUntil =
      b.status === 'COMPLETED' && b.completedAt
        ? new Date(b.completedAt.getTime() + REVIEW_WINDOW_DAYS * 86_400_000)
        : null;
    return {
      dto: {
        mine: mine ? present(mine) : null,
        theirs: theirs ? present(theirs) : null,
        reviewUntil,
      },
      canReview: !mine && reviewUntil !== null && now < reviewUntil,
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

  async adminDetail(
    b: BookingDetailRow,
    extras: { lenderCancellations: number; names: Map<string, string | null> },
  ): Promise<AdminBookingDetailDto> {
    const name = (id: string | null) => (id ? (extras.names.get(id) ?? null) : null);
    return {
      ...this.admin(b),
      conversationId: b.conversationId,
      pricePerDayPaise: b.pricePerDayPaise,
      rentPaise: b.rentPaise,
      feePaise: b.feePaise,
      depositPaise: b.depositPaise,
      creditPaise: b.creditPaise,
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
      cancellable: nextStatus('cancel', 'ADMIN', stateOf(b)) !== null,
      rental: this.rental(b),
      conditionReports: (await this.conditionReports(b)).map((r) => ({
        ...r,
        byName: r.by === 'BORROWER' ? b.borrower.name : b.lender.name,
      })),
      disputeId: b.dispute?.id ?? null,
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
