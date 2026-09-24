import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { CategoryDto } from '../categories/dto/category.dto.js';
import { rentFor } from '../listings/pricing.js';
import { UserPresenter } from '../users/user-presenter.js';
import { userViewInclude } from '../users/user-view.js';
import type { ListingCardDto } from './dto/search.dto.js';
import { roundDistanceKm } from './search-sql.js';

const cardInclude = () =>
  ({
    category: true,
    photos: { orderBy: { sortOrder: 'asc' }, take: 1 },
    lender: { include: userViewInclude() },
  }) satisfies Prisma.ListingInclude;

type CardRow = Prisma.ListingGetPayload<{ include: ReturnType<typeof cardInclude> }>;

export interface CardExtras {
  /** Metres from the searcher, by listing id. */
  distances?: Map<string, number | null>;
  /** Rental length for the searched dates. */
  days?: number;
  userId?: string;
}

/** Turns listing ids into cards, keeping the order given. */
@Injectable()
export class CardPresenter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly users: UserPresenter,
  ) {}

  async cards(ids: string[], extras: CardExtras = {}): Promise<ListingCardDto[]> {
    if (ids.length === 0) return [];
    const [rows, saved] = await Promise.all([
      this.prisma.listing.findMany({ where: { id: { in: ids } }, include: cardInclude() }),
      extras.userId
        ? this.prisma.favorite.findMany({
            where: { userId: extras.userId, listingId: { in: ids } },
            select: { listingId: true },
          })
        : Promise.resolve([]),
    ]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const savedIds = new Set(saved.map((s) => s.listingId));
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is CardRow => r !== undefined)
      .map((r) => this.card(r, extras, savedIds.has(r.id)));
  }

  private card(l: CardRow, extras: CardExtras, saved: boolean): ListingCardDto {
    const lender = this.users.present(l.lender);
    const distance = extras.distances?.get(l.id);
    return {
      id: l.id,
      title: l.title,
      category: CategoryDto.from(l.category),
      thumbUrl: l.photos[0] ? this.storage.publicUrl(l.photos[0].thumbKey) : null,
      pricePerDayPaise: l.pricePerDayPaise,
      weeklyDiscountPct: l.weeklyDiscountPct,
      depositPaise: l.depositPaise,
      areaLabel: l.areaLabel,
      distanceKm: distance === undefined || distance === null ? null : roundDistanceKm(distance),
      lender: {
        id: lender.id,
        name: lender.name,
        avatarUrl: lender.avatarUrl,
        idVerified: lender.idVerified,
      },
      saved,
      available: l.status === 'LIVE' && l.lender.status === 'ACTIVE',
      rentPaise: extras.days ? rentFor(l, extras.days).rent : null,
      days: extras.days ?? null,
    };
  }
}
