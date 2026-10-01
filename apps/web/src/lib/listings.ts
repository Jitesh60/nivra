import 'server-only';
import type { Schemas } from '@sajha/api-client';
import { publicApi, unwrap, userApi } from './api';

export type MyListing = Schemas['MyListingDto'];
export type AppConfig = Schemas['AppConfigDto'];

export async function getMyListings(): Promise<MyListing[]> {
  return unwrap((await userApi()).GET('/v1/me/listings'));
}

/** The user's own listing, or null if it isn't theirs / doesn't exist. */
export async function getMyListing(id: string): Promise<MyListing | null> {
  const result = await (await userApi()).GET('/v1/me/listings/{id}', { params: { path: { id } } });
  if (result.response.status === 404 || result.response.status === 400) return null;
  return unwrap(Promise.resolve(result));
}

export async function getAppConfig(): Promise<AppConfig> {
  return unwrap((await publicApi()).GET('/v1/config'));
}

export const STATUS: Record<
  MyListing['status'],
  { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'info' }
> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PENDING: { label: 'In review', tone: 'info' },
  LIVE: { label: 'Live', tone: 'success' },
  PAUSED: { label: 'Paused', tone: 'warning' },
  REJECTED: { label: 'Needs changes', tone: 'danger' },
  REMOVED: { label: 'Removed', tone: 'danger' },
  DELETED: { label: 'Deleted', tone: 'neutral' },
};

/** What a draft still needs before it can be published (mirrors the API's check). */
export function missingForPublish(l: MyListing, minPhotos: number): string[] {
  const missing: string[] = [];
  if (l.photos.length < minPhotos) {
    missing.push(minPhotos === 1 ? 'a photo' : `${minPhotos} photos`);
  }
  if (l.lat == null || l.lng == null) missing.push('the pickup location');
  if (!l.areaLabel) missing.push('the area name');
  return missing;
}
