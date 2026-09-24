import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { REDIS } from '../../redis/redis.module.js';
import { UPLOAD_MAX_BYTES, type UploadPurpose, type UploadTicketDto } from './dto/upload.dto.js';
import { sniffImage } from './image-pipeline.js';

const TICKET_TTL_SEC = 15 * 60;
const UPLOADS_PER_HOUR = 30;

interface Ticket {
  userId: string;
  purpose: UploadPurpose;
  contentType: string;
  size: number;
}

const ticketKey = (key: string) => `upload:${key}`;

/**
 * Direct-to-storage uploads.
 *
 * 1. `create` hands out a presigned PUT for a `tmp/…` key in the private bucket
 *    and remembers who asked for it (Redis, 15 minutes).
 * 2. The client PUTs the bytes.
 * 3. `claim` checks ownership, purpose, size and magic bytes, and returns the
 *    bytes for the caller to process; `discard` then deletes the temp object.
 */
@Injectable()
export class UploadsService {
  constructor(
    private readonly storage: StorageService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async create(
    userId: string,
    purpose: UploadPurpose,
    contentType: string,
    size: number,
  ): Promise<UploadTicketDto> {
    if (size > UPLOAD_MAX_BYTES[purpose]) {
      throw invalid(
        `Files for this purpose can be at most ${UPLOAD_MAX_BYTES[purpose] / 1024 / 1024} MB`,
      );
    }
    await this.limit(userId);

    const key = `tmp/${purpose.toLowerCase()}/${userId}/${randomUUID()}`;
    const upload = await this.storage.presignPut('private', key, contentType, size);
    const ticket: Ticket = { userId, purpose, contentType, size };
    await this.redis.set(ticketKey(key), JSON.stringify(ticket), 'EX', TICKET_TTL_SEC);
    return { key, ...upload };
  }

  /** Validates an uploaded file and returns its bytes. Throws UPLOAD_NOT_FOUND / UPLOAD_INVALID. */
  async claim(userId: string, key: string, purpose: UploadPurpose): Promise<Buffer> {
    const raw = await this.redis.get(ticketKey(key));
    const ticket = raw ? (JSON.parse(raw) as Ticket) : null;
    if (!ticket || ticket.userId !== userId || ticket.purpose !== purpose) throw notFound();

    const object = await this.storage.head('private', key);
    if (!object) throw notFound('The file hasn’t been uploaded yet');
    if (object.size !== ticket.size)
      throw invalid('The uploaded file doesn’t match what was announced');

    const bytes = await this.storage.getBytes('private', key);
    if (!sniffImage(bytes)) {
      await this.discard(key);
      throw invalid('The file is not a JPEG, PNG or WebP image');
    }
    return bytes;
  }

  /** Forgets an upload and deletes its temp object (after success or failure). */
  async discard(...keys: (string | undefined)[]): Promise<void> {
    const real = keys.filter((k): k is string => !!k);
    if (real.length === 0) return;
    await Promise.all([
      this.redis.del(...real.map(ticketKey)),
      this.storage.delete('private', real),
    ]);
  }

  private async limit(userId: string): Promise<void> {
    const key = `uploads:rate:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > UPLOADS_PER_HOUR) {
      throw new AppException(
        ErrorCode.UPLOAD_RATE_LIMITED,
        'Too many uploads. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfterSec: Math.max(await this.redis.ttl(key), 1) },
      );
    }
  }
}

function notFound(
  message = 'Upload not found or expired. Please upload the file again.',
): AppException {
  return new AppException(ErrorCode.UPLOAD_NOT_FOUND, message, HttpStatus.BAD_REQUEST);
}

export function invalid(message: string): AppException {
  return new AppException(ErrorCode.UPLOAD_INVALID, message, HttpStatus.BAD_REQUEST);
}
