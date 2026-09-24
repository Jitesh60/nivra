import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { ListingStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CategoriesService } from '../categories/categories.service.js';
import { processListingPhoto } from '../media/image-pipeline.js';
import { invalid, UploadsService } from '../media/uploads.service.js';
import type {
  BlockRangeDto,
  CreateListingDto,
  RequiredDocInputDto,
  UpdateListingDto,
} from './dto/listing.dto.js';
import {
  adminListingInclude,
  listingInclude,
  ListingPresenter,
  publicListingInclude,
} from './listing-presenter.js';
import { addDays, LISTING_RULES as R, todayUtc } from './listing-rules.js';
import { heldRanges } from '../bookings/availability.js';
import { OPEN_STATUSES } from '../bookings/booking-rules.js';

/** Statuses a lender can still edit. */
const EDITABLE: ListingStatus[] = ['DRAFT', 'PENDING', 'LIVE', 'PAUSED', 'REJECTED'];

/**
 * Listings: the lender's side (draft → publish → pause), the public detail,
 * and admin moderation. A lender's first listing is reviewed by an admin;
 * once one is approved, later listings publish straight to LIVE.
 */
@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly uploads: UploadsService,
    private readonly categories: CategoriesService,
    private readonly audit: AuditService,
    private readonly presenter: ListingPresenter,
  ) {}

  // ── Lender ──

  listMine(userId: string) {
    return this.prisma.listing.findMany({
      where: { lenderId: userId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      include: listingInclude(),
    });
  }

  async getMine(userId: string, id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, lenderId: userId, status: { not: 'DELETED' } },
      include: listingInclude(),
    });
    if (!listing) throw notFound();
    return listing;
  }

  async create(userId: string, input: CreateListingDto) {
    await this.categories.assertActive(input.categoryId);
    const minDays = input.minDays ?? R.rentalDays.min;
    const maxDays = input.maxDays ?? R.rentalDays.defaultMax;
    assertDays(minDays, maxDays);
    const { exactAddress, condition, ...rest } = input;
    const listing = await this.prisma.listing.create({
      data: {
        ...rest,
        condition: condition as Prisma.ListingCreateInput['condition'],
        minDays,
        maxDays,
        lenderId: userId,
        exactAddressEnc: this.presenter.encryptAddress(exactAddress || undefined) ?? null,
      },
    });
    return this.getMine(userId, listing.id);
  }

  async update(userId: string, id: string, input: UpdateListingDto) {
    const current = await this.editable(userId, id);
    if (input.categoryId && input.categoryId !== current.categoryId) {
      await this.categories.assertActive(input.categoryId);
    }
    assertDays(input.minDays ?? current.minDays, input.maxDays ?? current.maxDays);
    if ((input.lat === undefined) !== (input.lng === undefined)) {
      throw validation({ lng: ['send lat and lng together'] });
    }
    const { exactAddress, condition, ...rest } = input;
    await this.prisma.listing.update({
      where: { id },
      data: {
        ...rest,
        ...(condition ? { condition: condition as Prisma.ListingUpdateInput['condition'] } : {}),
        exactAddressEnc: this.presenter.encryptAddress(exactAddress),
        // A rejected listing goes back to draft once the lender edits it.
        ...(current.status === 'REJECTED' ? { status: 'DRAFT', rejectionReason: null } : {}),
      },
    });
    return this.getMine(userId, id);
  }

  async addPhoto(userId: string, id: string, uploadKey: string) {
    await this.editable(userId, id);
    const count = await this.prisma.listingPhoto.count({ where: { listingId: id } });
    if (count >= R.photos.max) {
      throw new AppException(
        ErrorCode.LISTING_PHOTO_LIMIT,
        `A listing can have up to ${R.photos.max} photos`,
        HttpStatus.CONFLICT,
      );
    }
    const bytes = await this.uploads.claim(userId, uploadKey, 'LISTING_PHOTO');
    try {
      let photo: Awaited<ReturnType<typeof processListingPhoto>>;
      try {
        photo = await processListingPhoto(bytes);
      } catch {
        throw invalid('That photo could not be read. Try another one.');
      }
      const base = `listings/${id}/${randomUUID()}`;
      const key = `${base}.webp`;
      const thumbKey = `${base}-thumb.webp`;
      await Promise.all([
        this.storage.put('public', key, photo.full, 'image/webp'),
        this.storage.put('public', thumbKey, photo.thumb, 'image/webp'),
      ]);
      const last = await this.prisma.listingPhoto.aggregate({
        where: { listingId: id },
        _max: { sortOrder: true },
      });
      await this.prisma.listingPhoto.create({
        data: {
          listingId: id,
          key,
          thumbKey,
          width: photo.width,
          height: photo.height,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
    } finally {
      await this.uploads.discard(uploadKey);
    }
    return this.getMine(userId, id);
  }

  async deletePhoto(userId: string, id: string, photoId: string) {
    const listing = await this.editable(userId, id);
    const photo = listing.photos.find((p) => p.id === photoId);
    if (!photo) throw notFound('Photo not found');
    if (listing.photos.length === 1 && ['LIVE', 'PAUSED', 'PENDING'].includes(listing.status)) {
      throw incomplete('A published listing needs at least one photo. Add another first.');
    }
    await this.prisma.listingPhoto.delete({ where: { id: photoId } });
    await this.storage.delete('public', [photo.key, photo.thumbKey]);
    return this.getMine(userId, id);
  }

  async reorderPhotos(userId: string, id: string, ids: string[]) {
    const listing = await this.editable(userId, id);
    const known = new Set(listing.photos.map((p) => p.id));
    if (
      ids.length !== known.size ||
      new Set(ids).size !== ids.length ||
      !ids.every((i) => known.has(i))
    ) {
      throw validation({ ids: ['must list every photo of the listing exactly once'] });
    }
    await this.prisma.$transaction(
      ids.map((photoId, sortOrder) =>
        this.prisma.listingPhoto.update({ where: { id: photoId }, data: { sortOrder } }),
      ),
    );
    return this.getMine(userId, id);
  }

  async setBlocks(userId: string, id: string, ranges: BlockRangeDto[]) {
    await this.editable(userId, id);
    const today = todayUtc();
    const horizon = addDays(today, R.blocks.horizonDays);
    const parsed = ranges.map((r, i) => {
      const startsOn = new Date(`${r.startsOn}T00:00:00Z`);
      const endsOn = new Date(`${r.endsOn}T00:00:00Z`);
      if (startsOn > endsOn) throw validation({ [`ranges.${i}`]: ['startsOn is after endsOn'] });
      if (endsOn < today) throw validation({ [`ranges.${i}`]: ['is in the past'] });
      if (endsOn > horizon) {
        throw validation({ [`ranges.${i}`]: [`must end within ${R.blocks.horizonDays} days`] });
      }
      return { startsOn: startsOn < today ? today : startsOn, endsOn };
    });
    await this.prisma.$transaction([
      this.prisma.availabilityBlock.deleteMany({ where: { listingId: id } }),
      this.prisma.availabilityBlock.createMany({
        data: parsed.map((r) => ({ listingId: id, ...r })),
      }),
    ]);
    return this.getMine(userId, id);
  }

  async setRequiredDocs(userId: string, id: string, items: RequiredDocInputDto[]) {
    await this.editable(userId, id);
    if (new Set(items.map((i) => i.docType)).size !== items.length) {
      throw validation({ items: ['each document type can be listed once'] });
    }
    await this.prisma.$transaction([
      this.prisma.listingRequiredDoc.deleteMany({ where: { listingId: id } }),
      this.prisma.listingRequiredDoc.createMany({
        data: items.map((i) => ({
          listingId: id,
          docType: i.docType as Prisma.ListingRequiredDocCreateManyInput['docType'],
          note: i.note ?? null,
        })),
      }),
    ]);
    return this.getMine(userId, id);
  }

  /** DRAFT → PENDING (first listing) or LIVE (lender already trusted). */
  async publish(userId: string, id: string, client: ClientInfo) {
    const listing = await this.getMine(userId, id);
    if (listing.status !== 'DRAFT') {
      throw conflict(`Only a draft can be published (this listing is ${label(listing.status)})`);
    }
    const missing = [
      ...(listing.photos.length < R.photos.min ? ['photo'] : []),
      ...(listing.lat === null || listing.lng === null ? ['location'] : []),
      ...(!listing.areaLabel ? ['areaLabel'] : []),
    ];
    if (missing.length > 0) {
      throw incomplete(`Add ${missing.join(', ')} before publishing`, { missing });
    }
    await this.categories.assertActive(listing.categoryId);

    const trusted =
      (await this.prisma.listing.count({
        where: { lenderId: userId, approvedAt: { not: null } },
      })) > 0;
    const status: ListingStatus = trusted ? 'LIVE' : 'PENDING';
    await this.transition(id, ['DRAFT'], {
      status,
      publishedAt: new Date(),
      rejectionReason: null,
    });
    await this.log('USER', userId, 'user.listing.publish', id, { status }, client);
    return { listing: await this.getMine(userId, id), inReview: status === 'PENDING' };
  }

  async pause(userId: string, id: string) {
    await this.getMine(userId, id);
    await this.transition(id, ['LIVE'], { status: 'PAUSED' }, 'Only a live listing can be paused');
    return this.getMine(userId, id);
  }

  async unpause(userId: string, id: string) {
    await this.getMine(userId, id);
    await this.transition(
      id,
      ['PAUSED'],
      { status: 'LIVE' },
      'Only a paused listing can be resumed',
    );
    return this.getMine(userId, id);
  }

  async delete(userId: string, id: string, client: ClientInfo) {
    const listing = await this.getMine(userId, id);
    const open = await this.prisma.booking.count({
      where: { listingId: listing.id, status: { in: [...OPEN_STATUSES] } },
    });
    if (open > 0) {
      throw new AppException(
        ErrorCode.LISTING_HAS_OPEN_BOOKINGS,
        'This item has bookings in progress. Pause it instead, or finish those bookings first.',
        HttpStatus.CONFLICT,
      );
    }
    await this.removeListing(listing.id);
    await this.log('USER', userId, 'user.listing.delete', id, {}, client);
  }

  /** Soft-deletes every listing of a user (account deletion). */
  async deleteAllFor(userId: string) {
    const listings = await this.prisma.listing.findMany({
      where: { lenderId: userId, status: { not: 'DELETED' } },
      select: { id: true },
    });
    for (const l of listings) await this.removeListing(l.id);
  }

  // ── Public ──

  async publicGet(id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, status: 'LIVE', lender: { status: 'ACTIVE' } },
      include: publicListingInclude(),
    });
    if (!listing) throw notFound();
    return listing;
  }

  /** Dates held by bookings (unavailable to everyone else). */
  heldRanges(id: string) {
    return heldRanges(this.prisma, id);
  }

  // ── Admin ──

  queue(query: { status: ListingStatus; search?: string; cursor?: string; limit: number }) {
    // Pending: oldest first (fair queue). Everything else: newest first.
    const pending = query.status === 'PENDING';
    const search = query.search?.trim();
    return this.prisma.listing
      .findMany({
        where: {
          status: query.status,
          ...(search
            ? {
                OR: [
                  { title: { contains: search, mode: 'insensitive' } },
                  { lender: { phone: { contains: search } } },
                  { lender: { name: { contains: search, mode: 'insensitive' } } },
                ],
              }
            : {}),
          ...(query.cursor ? { id: pending ? { gt: query.cursor } : { lt: query.cursor } } : {}),
        },
        orderBy: { id: pending ? 'asc' : 'desc' },
        take: query.limit + 1,
        include: adminListingInclude(),
      })
      .then((rows) => {
        const items = rows.slice(0, query.limit);
        return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
      });
  }

  async adminGet(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: adminListingInclude(),
    });
    if (!listing) throw notFound();
    return listing;
  }

  async approve(adminId: string, id: string, client: ClientInfo) {
    const now = new Date();
    await this.transition(
      id,
      ['PENDING'],
      {
        status: 'LIVE',
        approvedAt: now,
        reviewedById: adminId,
        reviewedAt: now,
        rejectionReason: null,
      },
      'Only a listing waiting for review can be approved',
    );
    await this.log('ADMIN', adminId, 'admin.listing.approve', id, {}, client);
    return this.adminGet(id);
  }

  async reject(adminId: string, id: string, reason: string, client: ClientInfo) {
    await this.transition(
      id,
      ['PENDING'],
      {
        status: 'REJECTED',
        rejectionReason: reason,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
      'Only a listing waiting for review can be rejected',
    );
    await this.log('ADMIN', adminId, 'admin.listing.reject', id, { reason }, client);
    return this.adminGet(id);
  }

  async unpublish(adminId: string, id: string, reason: string, client: ClientInfo) {
    await this.transition(
      id,
      ['PENDING', 'LIVE', 'PAUSED'],
      { status: 'REMOVED', rejectionReason: reason, reviewedById: adminId, reviewedAt: new Date() },
      'Only a pending, live or paused listing can be unpublished',
    );
    await this.log('ADMIN', adminId, 'admin.listing.unpublish', id, { reason }, client);
    return this.adminGet(id);
  }

  async changeCategory(adminId: string, id: string, categoryId: string, client: ClientInfo) {
    const listing = await this.adminGet(id);
    await this.categories.assertActive(categoryId);
    await this.prisma.listing.update({ where: { id }, data: { categoryId } });
    await this.log(
      'ADMIN',
      adminId,
      'admin.listing.category',
      id,
      { from: listing.category.slug, to: categoryId },
      client,
    );
    return this.adminGet(id);
  }

  // ── Internals ──

  /** The owner's listing, if it can still be edited. */
  private async editable(userId: string, id: string) {
    const listing = await this.getMine(userId, id);
    if (!EDITABLE.includes(listing.status)) {
      throw conflict(`This listing can’t be edited (it is ${label(listing.status)})`);
    }
    return listing;
  }

  /** Status-guarded update: fails with 409 if another request changed it first. */
  private async transition(
    id: string,
    from: ListingStatus[],
    data: Prisma.ListingUncheckedUpdateManyInput,
    message = 'The listing changed. Reload and try again.',
  ) {
    const { count } = await this.prisma.listing.updateMany({
      where: { id, status: { in: from } },
      data,
    });
    if (count === 0) {
      await this.adminGet(id); // 404 if it doesn't exist at all
      throw conflict(message);
    }
  }

  private async removeListing(id: string) {
    const photos = await this.prisma.listingPhoto.findMany({ where: { listingId: id } });
    await this.prisma.$transaction([
      this.prisma.listing.update({
        where: { id },
        data: { status: 'DELETED', deletedAt: new Date() },
      }),
      this.prisma.listingPhoto.deleteMany({ where: { listingId: id } }),
    ]);
    await this.storage.delete(
      'public',
      photos.flatMap((p) => [p.key, p.thumbKey]),
    );
  }

  private log(
    actorType: 'USER' | 'ADMIN',
    actorId: string,
    action: string,
    targetId: string,
    metadata: Prisma.InputJsonObject,
    client: ClientInfo,
  ) {
    return this.audit.log({
      actorType,
      actorId,
      action,
      targetType: 'listing',
      targetId,
      metadata,
      ip: client.ip,
    });
  }
}

function assertDays(minDays: number, maxDays: number) {
  if (minDays > maxDays) throw validation({ maxDays: ['must be at least minDays'] });
}

function label(status: ListingStatus) {
  return status.toLowerCase();
}

function notFound(message = 'Listing not found'): AppException {
  return new AppException(ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND);
}

function conflict(message: string): AppException {
  return new AppException(ErrorCode.LISTING_STATUS_CONFLICT, message, HttpStatus.CONFLICT);
}

function incomplete(message: string, details?: Record<string, unknown>): AppException {
  return new AppException(ErrorCode.LISTING_INCOMPLETE, message, HttpStatus.BAD_REQUEST, details);
}

function validation(details: Record<string, string[]>): AppException {
  return new AppException(
    ErrorCode.VALIDATION_FAILED,
    'Request validation failed',
    HttpStatus.BAD_REQUEST,
    details,
  );
}
