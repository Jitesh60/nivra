import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { thumbKeyOf } from '../bookings/booking-presenter.js';
import { processConditionPhoto } from '../media/image-pipeline.js';
import { invalid, UploadsService } from '../media/uploads.service.js';

/**
 * Condition photos and dispute evidence: claimed from uploads, re-encoded
 * (EXIF and location gone) and kept in the private bucket under the booking.
 */
@Injectable()
export class RentalPhotos {
  constructor(
    private readonly uploads: UploadsService,
    private readonly storage: StorageService,
  ) {}

  /** Stores each upload; returns the photo keys (thumbnails sit next to them). */
  async store(
    userId: string,
    bookingId: string,
    folder: 'condition' | 'dispute',
    uploadKeys: string[],
  ): Promise<string[]> {
    const unique = [...new Set(uploadKeys)];
    const stored: string[] = [];
    try {
      for (const uploadKey of unique) {
        const bytes = await this.uploads.claim(userId, uploadKey, 'CONDITION_PHOTO');
        let photo: Awaited<ReturnType<typeof processConditionPhoto>>;
        try {
          photo = await processConditionPhoto(bytes);
        } catch {
          throw invalid('One of the photos could not be read. Try another one.');
        }
        const key = `bookings/${bookingId}/${folder}/${randomUUID()}.webp`;
        await Promise.all([
          this.storage.put('private', key, photo.full, 'image/webp'),
          this.storage.put('private', thumbKeyOf(key), photo.thumb, 'image/webp'),
        ]);
        stored.push(key);
      }
      return stored;
    } catch (err) {
      await this.remove(stored);
      throw err;
    } finally {
      await this.uploads.discard(...unique);
    }
  }

  /** Deletes stored photos (after a failed step). */
  async remove(keys: string[]): Promise<void> {
    await this.storage.delete(
      'private',
      keys.flatMap((k) => [k, thumbKeyOf(k)]),
    );
  }
}

export function photosRequired(min: number): AppException {
  return new AppException(
    ErrorCode.PHOTOS_REQUIRED,
    `Add at least ${min} photos of the item’s condition.`,
    HttpStatus.BAD_REQUEST,
    { min },
  );
}
