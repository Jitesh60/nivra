import 'server-only';
import type { Schemas } from '@sajha/api-client';
import { publicApi, unwrap, userApi } from './api';
import { getAccessToken } from './session';

export type ListingCard = Schemas['ListingCardDto'];
export type Category = Schemas['CategoryDto'];
export type PublicListing = Schemas['PublicListingDto'];
export type Quote = Schemas['QuoteDto'];
export type ReviewPage = Schemas['ReviewPageDto'];
export type Home = Schemas['HomeDto'];
export type SearchPage = Schemas['SearchPageDto'];

/** Guests browse anonymously; signed-in users also see their saved hearts. */
async function browseApi() {
  return (await getAccessToken()) ? userApi() : publicApi();
}

/** Search and home filters, read from the page URL. */
export interface BrowseQuery {
  q?: string;
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  minPricePaise?: number;
  maxPricePaise?: number;
  condition?: ('NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR')[];
  verifiedLendersOnly?: boolean;
  sort?: 'distance' | 'relevance' | 'price_asc' | 'price_desc' | 'newest';
  cursor?: string;
}

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const num = (v: string | string[] | undefined) => {
  const n = Number(one(v));
  return Number.isFinite(n) && one(v) !== undefined ? n : undefined;
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONDITIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'] as const;
const SORTS = ['distance', 'relevance', 'price_asc', 'price_desc', 'newest'] as const;

export function parseBrowseQuery(params: Params): BrowseQuery {
  const lat = num(params.lat);
  const lng = num(params.lng);
  const hasArea = lat !== undefined && lng !== undefined;
  const startDate = one(params.start);
  const endDate = one(params.end);
  const datesOk = Boolean(startDate && endDate && DATE.test(startDate) && DATE.test(endDate));
  const minRupees = num(params.min);
  const maxRupees = num(params.max);
  const conditionValues = ([] as string[]).concat(params.condition ?? []);
  const sort = one(params.sort) as BrowseQuery['sort'];
  return {
    q: one(params.q)?.trim().slice(0, 100) || undefined,
    categoryId: one(params.category),
    startDate: datesOk ? startDate : undefined,
    endDate: datesOk ? endDate : undefined,
    lat: hasArea ? lat : undefined,
    lng: hasArea ? lng : undefined,
    radiusKm: hasArea ? Math.min(25, Math.max(1, num(params.r) ?? 5)) : undefined,
    minPricePaise: minRupees !== undefined ? Math.round(minRupees * 100) : undefined,
    maxPricePaise: maxRupees !== undefined ? Math.round(maxRupees * 100) : undefined,
    condition: conditionValues.filter((c): c is (typeof CONDITIONS)[number] =>
      (CONDITIONS as readonly string[]).includes(c),
    ),
    verifiedLendersOnly: one(params.verified) === '1' || undefined,
    sort: sort && SORTS.includes(sort) && (sort !== 'distance' || hasArea) ? sort : undefined,
    cursor: one(params.cursor),
  };
}

/** True when the visitor searched or filtered (otherwise the home feed shows). */
export function isSearch(q: BrowseQuery): boolean {
  return Boolean(
    q.q ||
    q.categoryId ||
    q.minPricePaise !== undefined ||
    q.maxPricePaise !== undefined ||
    q.condition?.length ||
    q.verifiedLendersOnly ||
    q.sort ||
    q.cursor,
  );
}

export async function getHome(q: BrowseQuery): Promise<Home> {
  const api = await browseApi();
  return unwrap(
    api.GET('/v1/home', {
      params: {
        query: { startDate: q.startDate, endDate: q.endDate, lat: q.lat, lng: q.lng },
      },
    }),
  );
}

export async function search(q: BrowseQuery): Promise<SearchPage> {
  const api = await browseApi();
  return unwrap(
    api.GET('/v1/search', {
      params: {
        query: {
          q: q.q,
          categoryId: q.categoryId,
          startDate: q.startDate,
          endDate: q.endDate,
          lat: q.lat,
          lng: q.lng,
          radiusKm: q.radiusKm,
          minPricePaise: q.minPricePaise,
          maxPricePaise: q.maxPricePaise,
          condition: q.condition?.length ? q.condition : undefined,
          verifiedLendersOnly: q.verifiedLendersOnly,
          sort: q.sort,
          cursor: q.cursor,
          limit: 24,
        },
      },
    }),
  );
}

export async function getCategories(): Promise<Category[]> {
  return unwrap((await publicApi()).GET('/v1/categories'));
}

/** A published listing, or null when it doesn't exist (or isn't public). */
export async function getListing(id: string): Promise<PublicListing | null> {
  const api = await browseApi();
  const result = await api.GET('/v1/listings/{id}', { params: { path: { id } } });
  if (result.response.status === 404 || result.response.status === 400) return null;
  return unwrap(Promise.resolve(result));
}

export async function getQuote(id: string, startDate: string, endDate: string): Promise<Quote> {
  const api = await browseApi();
  return unwrap(
    api.GET('/v1/listings/{id}/quote', {
      params: { path: { id }, query: { startDate, endDate } },
    }),
  );
}

export async function getReviews(id: string): Promise<ReviewPage> {
  return unwrap(
    (await publicApi()).GET('/v1/listings/{id}/reviews', {
      params: { path: { id }, query: { limit: 10 } },
    }),
  );
}

export async function getFavorites(): Promise<ListingCard[]> {
  return unwrap((await userApi()).GET('/v1/me/favorites'));
}
