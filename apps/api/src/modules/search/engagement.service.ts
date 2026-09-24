import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hmacSha256 } from '../../common/crypto/crypto.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { todayUtc } from '../listings/listing-rules.js';
import { CardPresenter } from './card-presenter.js';

/** Wishlist and listing views ("Popular this week"). */
@Injectable()
export class EngagementService {
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardPresenter,
    config: ConfigService<Env, true>,
  ) {
    this.pepper = config.get('OTP_PEPPER', { infer: true });
  }

  /**
   * Counts one view per viewer per listing per day. Guests are keyed by a
   * salted hash of IP + user agent + day; no raw IP is stored. A lender's
   * views of their own listing don't count.
   */
  async recordView(
    listing: { id: string; lenderId: string },
    userId: string | undefined,
    client: ClientInfo,
  ) {
    if (userId === listing.lenderId) return;
    const day = todayUtc();
    const viewerKey = userId
      ? `u:${userId}`
      : `g:${hmacSha256(`${client.ip ?? ''}|${client.userAgent ?? ''}|${day.toISOString()}`, this.pepper)}`;
    await this.prisma.listingView.createMany({
      data: [{ listingId: listing.id, viewerKey, day }],
      skipDuplicates: true,
    });
  }

  async isSaved(userId: string | undefined, listingId: string): Promise<boolean> {
    if (!userId) return false;
    return (await this.prisma.favorite.count({ where: { userId, listingId } })) > 0;
  }

  favoriteCount(listingId: string): Promise<number> {
    return this.prisma.favorite.count({ where: { listingId } });
  }

  /** Idempotent. Only live listings, and never your own. */
  async save(userId: string, listingId: string): Promise<void> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: 'LIVE', lender: { status: 'ACTIVE' } },
      select: { lenderId: true },
    });
    if (!listing) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Listing not found', HttpStatus.NOT_FOUND);
    }
    if (listing.lenderId === userId) {
      throw new AppException(
        ErrorCode.FAVORITE_OWN_LISTING,
        'You can’t save your own listing',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.favorite.createMany({ data: [{ userId, listingId }], skipDuplicates: true });
  }

  async remove(userId: string, listingId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId, listingId } });
  }

  /** Newest first. Items taken down since are kept, marked unavailable. */
  async wishlist(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId, listing: { status: { not: 'DELETED' } } },
      orderBy: { createdAt: 'desc' },
      select: { listingId: true },
      take: 200,
    });
    return this.cards.cards(
      favorites.map((f) => f.listingId),
      { userId },
    );
  }
}
