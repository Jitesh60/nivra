import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decrypt, encrypt } from '../../common/crypto/crypto.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { CategoryDto } from '../categories/dto/category.dto.js';
import { UserPresenter } from '../users/user-presenter.js';
import { userViewInclude } from '../users/user-view.js';
import type {
  AdminListingDto,
  LenderSummaryDto,
  ListingBaseDto,
  MyListingDto,
  PublicListingDto,
} from './dto/listing.dto.js';
import { approximate, todayUtc } from './listing-rules.js';

/** Everything a listing view needs, in one query. */
export function listingInclude() {
  return {
    category: true,
    photos: { orderBy: { sortOrder: 'asc' } },
    requiredDocs: { orderBy: { docType: 'asc' } },
    blocks: { where: { endsOn: { gte: todayUtc() } }, orderBy: { startsOn: 'asc' } },
  } satisfies Prisma.ListingInclude;
}

export function adminListingInclude() {
  return {
    ...listingInclude(),
    lender: {
      include: {
        ...userViewInclude(),
        listings: { where: { approvedAt: { not: null } }, select: { id: true }, take: 1 },
      },
    },
    reviewedBy: { select: { name: true } },
  } satisfies Prisma.ListingInclude;
}

export function publicListingInclude() {
  return {
    ...listingInclude(),
    lender: { include: userViewInclude() },
  } satisfies Prisma.ListingInclude;
}

export type ListingRow = Prisma.ListingGetPayload<{ include: ReturnType<typeof listingInclude> }>;
export type AdminListingRow = Prisma.ListingGetPayload<{
  include: ReturnType<typeof adminListingInclude>;
}>;
export type PublicListingRow = Prisma.ListingGetPayload<{
  include: ReturnType<typeof publicListingInclude>;
}>;

const day = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class ListingPresenter {
  private readonly addressKey: Buffer;

  constructor(
    config: ConfigService<Env, true>,
    private readonly storage: StorageService,
    private readonly users: UserPresenter,
  ) {
    this.addressKey = Buffer.from(config.get('ADDRESS_ENC_KEY', { infer: true }), 'base64');
  }

  mine(l: ListingRow): MyListingDto {
    return {
      ...this.base(l),
      status: l.status,
      rejectionReason: l.rejectionReason,
      lat: l.lat,
      lng: l.lng,
      exactAddress: l.exactAddressEnc ? decrypt(l.exactAddressEnc, this.addressKey) : null,
      publishedAt: l.publishedAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    };
  }

  public(
    l: PublicListingRow,
    extras: { saved: boolean; favoriteCount: number } = { saved: false, favoriteCount: 0 },
  ): PublicListingDto {
    return {
      ...this.base(l),
      approxLat: approximate(l.lat!),
      approxLng: approximate(l.lng!),
      lender: this.lender(l.lender),
      ...extras,
    };
  }

  admin(l: AdminListingRow): AdminListingDto {
    const lender = l.lender;
    return {
      ...this.base(l),
      status: l.status,
      rejectionReason: l.rejectionReason,
      approxLat: l.lat === null ? null : approximate(l.lat),
      approxLng: l.lng === null ? null : approximate(l.lng),
      lender: {
        ...this.lender(lender),
        phone: lender.phone,
        status: lender.status,
        firstListing: lender.listings.length === 0,
      },
      reviewedBy: l.reviewedBy?.name ?? null,
      reviewedAt: l.reviewedAt?.toISOString() ?? null,
      publishedAt: l.publishedAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    };
  }

  /** undefined = leave unchanged; '' = clear. */
  encryptAddress(address: string | undefined): string | null | undefined {
    if (address === undefined) return undefined;
    return address === '' ? null : encrypt(address, this.addressKey);
  }

  private lender(user: PublicListingRow['lender']): LenderSummaryDto {
    const u = this.users.present(user);
    return {
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      city: u.city,
      phoneVerified: u.phoneVerified,
      emailVerified: u.emailVerified,
      idVerified: u.idVerified,
      memberSince: u.createdAt,
    };
  }

  private base(l: ListingRow): ListingBaseDto {
    return {
      id: l.id,
      category: CategoryDto.from(l.category),
      title: l.title,
      description: l.description,
      condition: l.condition,
      brand: l.brand,
      size: l.size,
      pricePerDayPaise: l.pricePerDayPaise,
      weeklyDiscountPct: l.weeklyDiscountPct,
      depositPaise: l.depositPaise,
      minDays: l.minDays,
      maxDays: l.maxDays,
      advanceNoticeDays: l.advanceNoticeDays,
      areaLabel: l.areaLabel,
      photos: l.photos.map((p) => ({
        id: p.id,
        url: this.storage.publicUrl(p.key),
        thumbUrl: this.storage.publicUrl(p.thumbKey),
        width: p.width,
        height: p.height,
      })),
      requiredDocs: l.requiredDocs.map((d) => ({ docType: d.docType, note: d.note })),
      blocks: l.blocks.map((b) => ({ startsOn: day(b.startsOn), endsOn: day(b.endsOn) })),
    };
  }
}
