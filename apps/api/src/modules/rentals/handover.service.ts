import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { hmacSha256 } from '../../common/crypto/crypto.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Env } from '../../config/env.js';
import type { BookingParty, Prisma, RentalStage } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REDIS } from '../../redis/redis.token.js';
import { bookingNotFound, BookingStateMachine } from '../bookings/booking-state-machine.js';
import {
  claimUntil,
  handoverOpensAt,
  lateDaysFor,
  lateFeeFor,
  rentalEnd,
} from '../bookings/booking-rules.js';
import {
  type AddPhotosDto,
  type BookingCodeDto,
  type ConfirmStageDto,
  MAX_PHOTOS,
  MIN_CONFIRM_PHOTOS,
} from '../bookings/dto/rental.dto.js';
import { photosRequired, RentalPhotos } from './rental-photos.js';

/** Wrong codes allowed per booking and stage before a lock-out. */
export const CODE_MAX_TRIES = 5;
export const CODE_LOCK_SEC = 15 * 60;

/**
 * Handover and return. One person shows a 6-digit code (as a QR), the other
 * types or scans it and photographs the item's condition: that proves the
 * item changed hands. Codes are derived, never stored: HMAC(OTP_PEPPER,
 * booking and stage).
 */
@Injectable()
export class HandoverService {
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly machine: BookingStateMachine,
    private readonly photos: RentalPhotos,
    @Inject(REDIS) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.pepper = config.get('OTP_PEPPER', { infer: true });
  }

  /** The code for a booking and stage (deterministic, 6 digits). */
  codeFor(bookingId: string, stage: RentalStage): string {
    const mac = hmacSha256(`booking-code|${bookingId}|${stage}`, this.pepper);
    return (Number.parseInt(mac.slice(0, 12), 16) % 1_000_000).toString().padStart(6, '0');
  }

  /** The code the viewer shows: the borrower's at handover, the lender's at return. */
  async myCode(bookingId: string, userId: string): Promise<BookingCodeDto> {
    const b = await this.load(bookingId, userId);
    const stage: RentalStage | null =
      b.party === 'BORROWER' && b.status === 'CONFIRMED'
        ? 'HANDOVER'
        : b.party === 'LENDER' && b.status === 'ACTIVE'
          ? 'RETURN'
          : null;
    if (!stage) throw moved(b.status);
    const code = this.codeFor(bookingId, stage);
    return { stage, code, qr: `sajha://booking/${bookingId}/${stage}/${code}` };
  }

  /** The lender confirms the handover with the borrower's code and condition photos. */
  async handOver(bookingId: string, userId: string, dto: ConfirmStageDto): Promise<void> {
    const b = await this.load(bookingId, userId);
    if (b.party !== 'LENDER' || b.status !== 'CONFIRMED') throw moved(b.status);
    const now = new Date();
    if (now < handoverOpensAt(b.startsOn)) {
      throw new AppException(
        ErrorCode.HANDOVER_TOO_EARLY,
        'The handover opens the day before the rental starts.',
        HttpStatus.BAD_REQUEST,
        { opensAt: handoverOpensAt(b.startsOn) },
      );
    }
    if (now >= rentalEnd(b.endsOn)) throw moved(b.status);
    await this.checkCode(bookingId, 'HANDOVER', dto.code);
    await this.confirm(b, userId, dto, async (keys) => {
      await this.machine.transition(
        bookingId,
        'handOver',
        { party: 'LENDER', id: userId },
        {
          note: dto.note,
          patch: { handedOverAt: now },
          inTx: (tx) => this.saveReport(tx, bookingId, 'HANDOVER', userId, keys, dto.note),
        },
      );
    });
  }

  /** The borrower confirms the return with the lender's code and condition photos. */
  async markReturned(bookingId: string, userId: string, dto: ConfirmStageDto): Promise<void> {
    const b = await this.load(bookingId, userId);
    if (b.party !== 'BORROWER' || b.status !== 'ACTIVE') throw moved(b.status);
    await this.checkCode(bookingId, 'RETURN', dto.code);
    const now = new Date();
    const lateDays = lateDaysFor(b.endsOn, now);
    const lateFeePaise = lateFeeFor(lateDays, b.pricePerDayPaise, b.depositPaise);
    await this.confirm(b, userId, dto, async (keys) => {
      await this.machine.transition(
        bookingId,
        'markReturned',
        { party: 'BORROWER', id: userId },
        {
          note: dto.note,
          // The late fee is what the lender keeps unless a dispute awards more.
          patch: { returnedAt: now, lateDays, lateFeePaise, keptPaise: lateFeePaise },
          inTx: (tx) => this.saveReport(tx, bookingId, 'RETURN', userId, keys, dto.note),
        },
      );
    });
  }

  /**
   * More condition photos from either person: handover photos while the item
   * is out, return photos during the claim window. Up to 6 each.
   */
  async addPhotos(bookingId: string, userId: string, dto: AddPhotosDto): Promise<void> {
    const b = await this.load(bookingId, userId);
    const now = new Date();
    const open =
      dto.stage === 'HANDOVER'
        ? b.status === 'ACTIVE'
        : b.status === 'RETURNED' && !!b.returnedAt && now < claimUntil(b.returnedAt);
    if (!open) throw moved(b.status);
    const existing = await this.prisma.conditionReport.findUnique({
      where: { bookingId_stage_byUserId: { bookingId, stage: dto.stage, byUserId: userId } },
    });
    const have = existing?.photoKeys.length ?? 0;
    if (have + new Set(dto.photoKeys).size > MAX_PHOTOS) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `At most ${MAX_PHOTOS} photos each (you have ${have}).`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const keys = await this.photos.store(userId, bookingId, 'condition', dto.photoKeys);
    try {
      await this.prisma.$transaction((tx) =>
        this.saveReport(tx, bookingId, dto.stage, userId, keys, dto.note),
      );
    } catch (err) {
      await this.photos.remove(keys);
      throw err;
    }
  }

  /** The lender says the borrower never came: a late borrower cancellation. */
  async noShow(bookingId: string, userId: string, note?: string): Promise<void> {
    const b = await this.load(bookingId, userId);
    if (b.party !== 'LENDER') throw moved(b.status);
    await this.machine.transition(
      bookingId,
      'noShow',
      { party: 'LENDER', id: userId },
      {
        note: note?.trim() || null,
        patch: {
          noShowAt: new Date(),
          cancelledBy: 'BORROWER',
          cancelReason: note?.trim() || 'Didn’t come for the pickup',
        },
      },
    );
  }

  // ── Internals ──

  private async confirm(
    b: { id: string },
    userId: string,
    dto: ConfirmStageDto,
    step: (keys: string[]) => Promise<void>,
  ): Promise<void> {
    if (new Set(dto.photoKeys).size < MIN_CONFIRM_PHOTOS) throw photosRequired(MIN_CONFIRM_PHOTOS);
    const keys = await this.photos.store(userId, b.id, 'condition', dto.photoKeys);
    try {
      await step(keys);
    } catch (err) {
      await this.photos.remove(keys);
      throw err;
    }
  }

  /** Adds photos to this person's report for the stage (created on first use). */
  private async saveReport(
    tx: Prisma.TransactionClient,
    bookingId: string,
    stage: RentalStage,
    userId: string,
    keys: string[],
    note?: string,
  ): Promise<void> {
    await tx.conditionReport.upsert({
      where: { bookingId_stage_byUserId: { bookingId, stage, byUserId: userId } },
      create: { bookingId, stage, byUserId: userId, photoKeys: keys, note: note?.trim() || null },
      update: {
        photoKeys: { push: keys },
        ...(note?.trim() ? { note: note.trim() } : {}),
      },
    });
  }

  /** Wrong codes count towards a short lock-out; the right one clears the count. */
  private async checkCode(bookingId: string, stage: RentalStage, code: string): Promise<void> {
    const key = `booking:code:${bookingId}:${stage}`;
    const fails = Number((await this.redis.get(key)) ?? 0);
    if (fails >= CODE_MAX_TRIES) {
      const ttl = await this.redis.ttl(key);
      throw new AppException(
        ErrorCode.BOOKING_CODE_LOCKED,
        'Too many wrong codes. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfterSec: ttl > 0 ? ttl : CODE_LOCK_SEC },
      );
    }
    if (code === this.codeFor(bookingId, stage)) {
      await this.redis.del(key);
      return;
    }
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, CODE_LOCK_SEC);
    const triesLeft = Math.max(0, CODE_MAX_TRIES - count);
    throw new AppException(
      ErrorCode.BOOKING_CODE_INVALID,
      triesLeft > 0
        ? `That code doesn’t match. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left.`
        : 'That code doesn’t match. Try again in a few minutes.',
      HttpStatus.BAD_REQUEST,
      { triesLeft },
    );
  }

  private async load(bookingId: string, userId: string) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || (b.borrowerId !== userId && b.lenderId !== userId)) throw bookingNotFound();
    const party: BookingParty = b.borrowerId === userId ? 'BORROWER' : 'LENDER';
    return { ...b, party };
  }
}

export function moved(status: string): AppException {
  return new AppException(
    ErrorCode.BOOKING_INVALID_TRANSITION,
    'This booking has moved on. Refresh to see where it is now.',
    HttpStatus.CONFLICT,
    { status },
  );
}
