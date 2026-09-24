import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { VIEW_URL_TTL_SEC } from '../documents/documents.service.js';
import { todayUtc } from '../listings/listing-rules.js';
import { bookingRef } from './booking-presenter.js';
import { DOCUMENT_ACCESS_STATUSES, satisfies } from './booking-rules.js';
import { bookingNotFound, BookingStateMachine } from './booking-state-machine.js';
import type { DocumentViewUrlDto, ShareChoiceDto } from './dto/booking.dto.js';

/**
 * Documents a borrower shares with one lender for one booking. The vault
 * files are copied to `bookings/{bookingId}/…` so the share doesn't depend on
 * the vault, and the copies are deleted a while after the booking closes.
 */
@Injectable()
export class BookingDocumentsService {
  private readonly logger = new Logger(BookingDocumentsService.name);
  private readonly retentionDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly machine: BookingStateMachine,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.retentionDays = config.get('SHARE_RETENTION_DAYS', { infer: true });
  }

  /** The borrower shares one vault document per document the listing asks for. */
  async submit(
    bookingId: string,
    userId: string,
    choices: ShareChoiceDto[],
    client: ClientInfo,
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        borrowerId: true,
        lenderId: true,
        listing: { select: { requiredDocs: true } },
      },
    });
    if (!booking || (booking.borrowerId !== userId && booking.lenderId !== userId)) {
      throw bookingNotFound();
    }
    if (booking.borrowerId !== userId) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_ALLOWED,
        'Only the borrower can share documents',
        HttpStatus.FORBIDDEN,
      );
    }

    const required = booking.listing.requiredDocs;
    const byRequired = new Map(choices.map((c) => [c.requiredDocId, c.userDocumentId]));
    const missing = required.filter((r) => !byRequired.has(r.id)).map((r) => r.docType);
    const unknown = choices.filter((c) => !required.some((r) => r.id === c.requiredDocId));
    if (missing.length > 0 || unknown.length > 0 || byRequired.size !== choices.length) {
      throw mismatch('Share one document for each document the lender asks for', { missing });
    }

    const docs = await this.prisma.userDocument.findMany({
      where: { id: { in: choices.map((c) => c.userDocumentId) }, userId, deletedAt: null },
    });
    const today = todayUtc();
    const picked = required.map((r) => {
      const doc = docs.find((d) => d.id === byRequired.get(r.id));
      if (!doc) throw mismatch('That document isn’t in your vault', { requiredDocId: r.id });
      if (doc.status === 'REJECTED') {
        throw mismatch('Sajha couldn’t verify that document. Pick or add another one.', {
          requiredDocId: r.id,
        });
      }
      if (doc.expiresOn && doc.expiresOn < today) {
        throw mismatch('That document has expired', { requiredDocId: r.id });
      }
      if (!satisfies(r.docType, doc.type)) {
        throw mismatch('That type of document doesn’t match what the lender asks for', {
          requiredDocId: r.id,
          docType: doc.type,
        });
      }
      return { required: r, doc };
    });

    // Copy the files first; if the booking has moved on meanwhile, delete the copies.
    const copies: string[] = [];
    const shares: Prisma.BookingDocumentShareCreateManyInput[] = [];
    try {
      for (const { required: r, doc } of picked) {
        const id = randomUUID();
        const frontKey = await this.copy(doc.frontKey, `bookings/${bookingId}/${id}-front.jpg`);
        copies.push(frontKey);
        const backKey = doc.backKey
          ? await this.copy(doc.backKey, `bookings/${bookingId}/${id}-back.jpg`)
          : null;
        if (backKey) copies.push(backKey);
        shares.push({
          id,
          bookingId,
          requiredDocId: r.id,
          userDocumentId: doc.id,
          docType: doc.type,
          label: doc.label,
          verified: doc.status === 'APPROVED',
          frontKey,
          backKey,
        });
      }
      await this.machine.transition(
        bookingId,
        'submitDocs',
        { party: 'BORROWER', id: userId },
        {
          inTx: async (tx) => {
            await tx.bookingDocumentShare.createMany({ data: shares });
          },
        },
      );
    } catch (err) {
      await this.storage.delete('private', copies).catch(() => undefined);
      throw err;
    }
    await this.audit.log({
      actorType: 'USER',
      actorId: userId,
      action: 'user.booking.documents.share',
      targetType: 'booking',
      targetId: bookingId,
      metadata: { documents: picked.map((p) => p.doc.id) },
      ip: client.ip,
    });
  }

  async approve(bookingId: string, userId: string): Promise<void> {
    await this.asLender(bookingId, userId);
    await this.machine.transition(
      bookingId,
      'approveDocs',
      { party: 'LENDER', id: userId },
      {
        inTx: async (tx) => {
          await tx.bookingDocumentShare.updateMany({
            where: { bookingId, status: 'SUBMITTED' },
            data: { status: 'APPROVED' },
          });
        },
      },
    );
  }

  /** Not accepted: the booking is declined (the borrower can request again). */
  async reject(bookingId: string, userId: string, reason: string): Promise<void> {
    await this.asLender(bookingId, userId);
    await this.machine.transition(
      bookingId,
      'rejectDocs',
      { party: 'LENDER', id: userId },
      {
        note: reason,
        patch: { declineReason: reason.trim() },
        inTx: async (tx) => {
          await tx.bookingDocumentShare.updateMany({
            where: { bookingId, status: 'SUBMITTED' },
            data: { status: 'REJECTED' },
          });
        },
      },
    );
  }

  /**
   * A 5-minute link for the lender to look at a shared document, while the
   * booking is in progress. Every view is logged, and the borrower sees it.
   */
  async viewUrl(
    bookingId: string,
    shareId: string,
    side: 'front' | 'back',
    userId: string,
    client: ClientInfo,
  ): Promise<DocumentViewUrlDto> {
    const share = await this.prisma.bookingDocumentShare.findUnique({
      where: { id: shareId },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            borrowerId: true,
            lenderId: true,
            lender: { select: { name: true } },
          },
        },
      },
    });
    const b = share?.booking;
    if (!share || !b || b.id !== bookingId || (b.lenderId !== userId && b.borrowerId !== userId)) {
      throw notFound();
    }
    if (b.lenderId !== userId) {
      // The borrower has the original in their vault.
      throw new AppException(
        ErrorCode.BOOKING_NOT_ALLOWED,
        'Only the lender views shared documents here',
        HttpStatus.FORBIDDEN,
      );
    }
    const now = new Date();
    const key = side === 'front' ? share.frontKey : share.backKey;
    const open =
      (DOCUMENT_ACCESS_STATUSES as readonly string[]).includes(b.status) &&
      share.purgedAt === null &&
      (share.accessExpiresAt === null || share.accessExpiresAt > now);
    if (!open) {
      throw new AppException(
        ErrorCode.DOCUMENT_ACCESS_ENDED,
        'Access to this document has ended',
        HttpStatus.GONE,
      );
    }
    if (!key) throw notFound();

    await this.prisma.documentAccessLog.create({
      data: { shareId, viewerId: userId, viewerType: 'USER', ip: client.ip ?? null },
    });
    await this.audit.log({
      actorType: 'USER',
      actorId: userId,
      action: 'booking.document.view',
      targetType: 'booking_document_share',
      targetId: shareId,
      metadata: { bookingId, side },
      ip: client.ip,
    });
    const url = await this.storage.presignGet(key, VIEW_URL_TTL_SEC);
    const at = now.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    return {
      url,
      expiresAt: new Date(now.getTime() + VIEW_URL_TTL_SEC * 1000),
      watermark: `Shared with ${b.lender.name ?? 'the lender'} for booking ${bookingRef(b.id)} · ${at}`,
    };
  }

  /**
   * Deletes shared copies [retentionDays] after their booking closed (a
   * disputed booking keeps them until the dispute is resolved).
   */
  async purgeClosed(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.retentionDays * 86_400_000);
    const due = await this.prisma.bookingDocumentShare.findMany({
      where: {
        purgedAt: null,
        booking: { closedAt: { lte: cutoff }, status: { not: 'DISPUTED' } },
      },
      select: { id: true, frontKey: true, backKey: true },
      take: 500,
    });
    if (due.length === 0) return 0;
    await this.storage.delete(
      'private',
      due.flatMap((s) => [s.frontKey, s.backKey]),
    );
    await this.prisma.bookingDocumentShare.updateMany({
      where: { id: { in: due.map((s) => s.id) } },
      data: { purgedAt: now, frontKey: null, backKey: null },
    });
    this.logger.log(`Purged ${due.length} shared document(s)`);
    return due.length;
  }

  private async copy(from: string, to: string): Promise<string> {
    const bytes = await this.storage.getBytes('private', from);
    await this.storage.put('private', to, bytes, 'image/jpeg');
    return to;
  }

  private async asLender(bookingId: string, userId: string): Promise<void> {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { borrowerId: true, lenderId: true },
    });
    if (!b || (b.borrowerId !== userId && b.lenderId !== userId)) throw bookingNotFound();
    if (b.lenderId !== userId) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_ALLOWED,
        'Only the lender reviews documents',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}

function mismatch(message: string, details: Record<string, unknown>): AppException {
  return new AppException(
    ErrorCode.BOOKING_DOCS_MISMATCH,
    message,
    HttpStatus.BAD_REQUEST,
    details,
  );
}

function notFound(): AppException {
  return new AppException(ErrorCode.NOT_FOUND, 'Document not found', HttpStatus.NOT_FOUND);
}
