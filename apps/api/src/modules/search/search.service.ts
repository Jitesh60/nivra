import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CategoriesService } from '../categories/categories.service.js';
import { CategoryDto } from '../categories/dto/category.dto.js';
import { addDays, todayUtc } from '../listings/listing-rules.js';
import { rentalDays } from '../listings/pricing.js';
import { CardPresenter } from './card-presenter.js';
import type {
  AreaQueryDto,
  HomeDto,
  SearchPageDto,
  SearchQueryDto,
  SearchSort,
} from './dto/search.dto.js';
import {
  afterCursor,
  availableBetween,
  decodeCursor,
  encodeCursor,
  filterConditions,
  point,
  PUBLIC_LISTINGS,
  sortSpec,
  tsQuery,
} from './search-sql.js';

const HOME_ROW = 10;
const NEAR_YOU_KM = 10;
const POPULAR_KM = 25;

interface Row {
  id: string;
  sort_value: number;
  distance_m: number | null;
}

/**
 * Discovery: keyword, area, date and filter search over live listings, and
 * the home feed. One parameterised SQL query (PostGIS radius on the GIST
 * index, full text on the GIN index), then cards are loaded by id.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardPresenter,
    private readonly categories: CategoriesService,
  ) {}

  async search(query: SearchQueryDto, userId?: string): Promise<SearchPageDto> {
    const hasArea = checkArea(query);
    const dates = checkDates(query);
    const q = query.q ? tsQuery(query.q) : null;
    const origin = hasArea ? point(query.lat!, query.lng!) : null;
    const sort: SearchSort = query.sort ?? (q ? 'relevance' : origin ? 'distance' : 'newest');
    if (sort === 'distance' && !origin) throw invalid('sort', 'distance needs lat and lng');
    if (sort === 'relevance' && !q) throw invalid('sort', 'relevance needs keywords (q)');
    if (
      query.minPricePaise !== undefined &&
      query.maxPricePaise !== undefined &&
      query.minPricePaise > query.maxPricePaise
    ) {
      throw invalid('maxPricePaise', 'must be at least minPricePaise');
    }

    const spec = sortSpec(sort, origin, q);
    const where: Prisma.Sql[] = [PUBLIC_LISTINGS, ...filterConditions(query)];
    if (dates) where.push(availableBetween(dates.start, dates.end, dates.days));
    if (query.cursor) where.push(afterCursor(spec, decodeCursor(query.cursor)));

    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT l.id::text AS id,
             ${spec.expr} AS sort_value,
             ${origin ? Prisma.sql`ST_Distance(l.location, ${origin})` : Prisma.sql`NULL::float8`} AS distance_m
      FROM listings l
      JOIN users u ON u.id = l.lender_id
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY sort_value ${spec.desc ? Prisma.sql`DESC` : Prisma.sql`ASC`}, l.id ASC
      LIMIT ${query.limit + 1}`;

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: await this.cards.cards(
        page.map((r) => r.id),
        { distances: distanceMap(page), days: dates?.days, userId },
      ),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ v: Number(last.sort_value), id: last.id })
          : null,
      sort,
    };
  }

  async home(query: AreaQueryDto, userId?: string): Promise<HomeDto> {
    const hasArea = checkArea(query);
    const categories = (await this.categories.listActive()).map(CategoryDto.from);
    const nearYou = hasArea
      ? (
          await this.search(
            { ...query, radiusKm: NEAR_YOU_KM, sort: 'distance', limit: HOME_ROW },
            userId,
          )
        ).items
      : [];
    const origin = hasArea ? point(query.lat!, query.lng!) : null;
    const within = origin
      ? Prisma.sql`AND ST_DWithin(l.location, ${origin}, ${POPULAR_KM * 1000}::float8)`
      : Prisma.empty;

    const popular = await this.prisma.$queryRaw<Row[]>`
      SELECT l.id::text AS id,
             (coalesce(v.n, 0) + 3 * coalesce(f.n, 0))::float8 AS sort_value,
             ${origin ? Prisma.sql`ST_Distance(l.location, ${origin})` : Prisma.sql`NULL::float8`} AS distance_m
      FROM listings l
      JOIN users u ON u.id = l.lender_id
      LEFT JOIN (
        SELECT listing_id, count(*) AS n FROM listing_views
        WHERE day >= current_date - 6 GROUP BY listing_id
      ) v ON v.listing_id = l.id
      LEFT JOIN (
        SELECT listing_id, count(*) AS n FROM favorites
        WHERE created_at >= now() - interval '7 days' GROUP BY listing_id
      ) f ON f.listing_id = l.id
      WHERE ${PUBLIC_LISTINGS} ${within}
        AND (coalesce(v.n, 0) + coalesce(f.n, 0)) > 0
      ORDER BY sort_value DESC, coalesce(l.published_at, l.created_at) DESC, l.id
      LIMIT ${HOME_ROW}`;

    const newest = await this.prisma.$queryRaw<Row[]>`
      SELECT l.id::text AS id, 0::float8 AS sort_value,
             ${origin ? Prisma.sql`ST_Distance(l.location, ${origin})` : Prisma.sql`NULL::float8`} AS distance_m
      FROM listings l
      JOIN users u ON u.id = l.lender_id
      WHERE ${PUBLIC_LISTINGS} ${within}
      ORDER BY coalesce(l.published_at, l.created_at) DESC, l.id
      LIMIT ${HOME_ROW}`;

    const [popularCards, newestCards] = await Promise.all([
      this.cards.cards(
        popular.map((r) => r.id),
        { distances: distanceMap(popular), userId },
      ),
      this.cards.cards(
        newest.map((r) => r.id),
        { distances: distanceMap(newest), userId },
      ),
    ]);
    return { categories, nearYou, popularThisWeek: popularCards, newest: newestCards };
  }

  /** Cards for "Recently viewed": live listings only, in the order given. */
  async cardsFor(ids: string[], userId?: string) {
    if (ids.length > 20) throw invalid('ids', 'at most 20');
    const live = await this.prisma.listing.findMany({
      where: { id: { in: ids }, status: 'LIVE', lender: { status: 'ACTIVE' } },
      select: { id: true },
    });
    const liveIds = new Set(live.map((l) => l.id));
    return this.cards.cards(
      ids.filter((id) => liveIds.has(id)),
      { userId },
    );
  }
}

function distanceMap(rows: Row[]): Map<string, number | null> {
  return new Map(rows.map((r) => [r.id, r.distance_m === null ? null : Number(r.distance_m)]));
}

function checkArea(q: { lat?: number; lng?: number }): boolean {
  if ((q.lat === undefined) !== (q.lng === undefined)) {
    throw invalid('lng', 'send lat and lng together');
  }
  return q.lat !== undefined;
}

/** Validated [start, end] (both or neither), within the next year. */
export function checkDates(q: { startDate?: string; endDate?: string }) {
  if (!q.startDate && !q.endDate) return null;
  if (!q.startDate || !q.endDate) throw invalid('endDate', 'send startDate and endDate together');
  const start = new Date(`${q.startDate}T00:00:00Z`);
  const end = new Date(`${q.endDate}T00:00:00Z`);
  const today = todayUtc();
  if (end < start) throw invalid('endDate', 'must be on or after startDate');
  if (start < today) throw invalid('startDate', 'is in the past');
  if (end > addDays(today, 365)) throw invalid('endDate', 'must be within a year');
  return {
    start: q.startDate,
    end: q.endDate,
    startDate: start,
    endDate: end,
    days: rentalDays(start, end),
  };
}

function invalid(field: string, message: string): AppException {
  return new AppException(
    ErrorCode.VALIDATION_FAILED,
    'Request validation failed',
    HttpStatus.BAD_REQUEST,
    {
      [field]: [message],
    },
  );
}
