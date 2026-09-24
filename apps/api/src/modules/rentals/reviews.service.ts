import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { bookingNotFound } from '../bookings/booking-state-machine.js';
import { REVIEW_PUBLISH_DAYS, REVIEW_WINDOW_DAYS } from '../bookings/booking-rules.js';
import type { ReviewPageDto, ReviewsQueryDto, WriteReviewDto } from '../bookings/dto/rental.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const DAY_MS = 86_400_000;

const publicInclude = {
  author: { select: { name: true, profile: { select: { avatarKey: true } } } },
  booking: { select: { listing: { select: { title: true } } } },
} satisfies Prisma.ReviewInclude;

/**
 * Ratings after a completed rental, double-blind: a review stays hidden until
 * the other person has written theirs, or 7 days after completion. Publishing
 * updates the person's (and, for a lender, the item's) average.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  async write(bookingId: string, userId: string, dto: WriteReviewDto): Promise<void> {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { reviews: true, listing: { select: { title: true } } },
    });
    if (!b || (b.borrowerId !== userId && b.lenderId !== userId)) throw bookingNotFound();
    const isBorrower = b.borrowerId === userId;
    const until = b.completedAt
      ? new Date(b.completedAt.getTime() + REVIEW_WINDOW_DAYS * DAY_MS)
      : null;
    if (
      b.status !== 'COMPLETED' ||
      !until ||
      new Date() >= until ||
      b.reviews.some((r) => r.authorId === userId)
    ) {
      throw notAllowed();
    }
    const theirs = b.reviews.find((r) => r.authorId !== userId);
    try {
      await this.prisma.$transaction(async (tx) => {
        const mine = await tx.review.create({
          data: {
            bookingId,
            authorId: userId,
            subjectId: isBorrower ? b.lenderId : b.borrowerId,
            authorRole: isBorrower ? 'BORROWER' : 'LENDER',
            rating: dto.rating,
            comment: dto.comment?.trim() || null,
          },
        });
        // Both have written one: publish both.
        if (theirs) await this.publish(tx, [mine.id, theirs.id]);
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw notAllowed();
      throw err;
    }
    if (!theirs) {
      await this.notifications.notify(
        isBorrower ? b.lenderId : b.borrowerId,
        {
          type: 'booking.review_waiting',
          title: 'You have a review waiting',
          body: `Rate your rental of ${b.listing.title} to see what they wrote.`,
          bookingId,
        },
        { push: false },
      );
    }
  }

  /** The sweep: one-sided reviews go public 7 days after completion. */
  async publishDue(now = new Date()): Promise<number> {
    const due = await this.prisma.review.findMany({
      where: {
        publishedAt: null,
        booking: { completedAt: { lte: new Date(now.getTime() - REVIEW_PUBLISH_DAYS * DAY_MS) } },
      },
      select: { id: true },
      take: 500,
    });
    if (due.length === 0) return 0;
    await this.prisma.$transaction((tx) =>
      this.publish(
        tx,
        due.map((r) => r.id),
      ),
    );
    return due.length;
  }

  async forUser(userId: string, query: ReviewsQueryDto): Promise<ReviewPageDto> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    return this.page({ subjectId: userId }, query, profile);
  }

  async forListing(listingId: string, query: ReviewsQueryDto): Promise<ReviewPageDto> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.deletedAt) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Listing not found', HttpStatus.NOT_FOUND);
    }
    return this.page({ authorRole: 'BORROWER', booking: { listingId } }, query, listing);
  }

  // ── Internals ──

  private async page(
    where: Prisma.ReviewWhereInput,
    query: ReviewsQueryDto,
    totals: { ratingAvg: number | null; ratingCount: number } | null,
  ): Promise<ReviewPageDto> {
    const rows = await this.prisma.review.findMany({
      where: {
        ...where,
        publishedAt: { not: null },
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: publicInclude,
    });
    const page = rows.slice(0, query.limit);
    return {
      ratingAvg: totals?.ratingAvg ?? null,
      ratingCount: totals?.ratingCount ?? 0,
      items: page.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        authorRole: r.authorRole,
        authorName: r.author.name?.split(' ')[0] ?? null,
        authorAvatarUrl: r.author.profile?.avatarKey
          ? this.storage.publicUrl(r.author.profile.avatarKey)
          : null,
        listingTitle: r.booking.listing.title,
        publishedAt: r.publishedAt!,
      })),
      nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
    };
  }

  /** Publishes reviews and refreshes the averages they count towards. */
  private async publish(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
    await tx.review.updateMany({
      where: { id: { in: ids }, publishedAt: null },
      data: { publishedAt: new Date() },
    });
    const reviews = await tx.review.findMany({
      where: { id: { in: ids } },
      select: { subjectId: true, authorRole: true, booking: { select: { listingId: true } } },
    });
    for (const subjectId of new Set(reviews.map((r) => r.subjectId))) {
      const agg = await tx.review.aggregate({
        where: { subjectId, publishedAt: { not: null } },
        _avg: { rating: true },
        _count: true,
      });
      const data = { ratingAvg: round(agg._avg.rating), ratingCount: agg._count };
      await tx.profile.upsert({
        where: { userId: subjectId },
        create: { userId: subjectId, ...data },
        update: data,
      });
    }
    const listings = new Set(
      reviews.filter((r) => r.authorRole === 'BORROWER').map((r) => r.booking.listingId),
    );
    for (const listingId of listings) {
      const agg = await tx.review.aggregate({
        where: { authorRole: 'BORROWER', publishedAt: { not: null }, booking: { listingId } },
        _avg: { rating: true },
        _count: true,
      });
      await tx.listing.update({
        where: { id: listingId },
        data: { ratingAvg: round(agg._avg.rating), ratingCount: agg._count },
      });
    }
  }
}

/** One decimal, e.g. 4.7. */
function round(avg: number | null): number | null {
  return avg === null ? null : Math.round(avg * 10) / 10;
}

function notAllowed(): AppException {
  return new AppException(
    ErrorCode.REVIEW_NOT_ALLOWED,
    'You can’t review this booking (already reviewed, or not completed).',
    HttpStatus.CONFLICT,
  );
}
