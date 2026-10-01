import 'server-only';
import type { Schemas } from '@sajha/api-client';
import { unwrap, userApi } from './api';

export type ItemRequest = Schemas['ItemRequestDetailDto'];
export type ItemRequestCard = Schemas['ItemRequestDto'];
export type SavedSearch = Schemas['SavedSearchDto'];
export type Referral = Schemas['MyReferralDto'];

export async function getRequests(q: {
  lat: number;
  lng: number;
  radiusKm?: number;
  cursor?: string;
}) {
  return unwrap((await userApi()).GET('/v1/requests', { params: { query: { ...q, limit: 30 } } }));
}

export async function getMyRequests(): Promise<ItemRequest[]> {
  return unwrap((await userApi()).GET('/v1/me/requests'));
}

export async function getRequest(id: string): Promise<ItemRequest | null> {
  const result = await (await userApi()).GET('/v1/requests/{id}', { params: { path: { id } } });
  if ([400, 403, 404].includes(result.response.status)) return null;
  return unwrap(Promise.resolve(result));
}

export async function getSavedSearches(): Promise<SavedSearch[]> {
  return unwrap((await userApi()).GET('/v1/me/saved-searches'));
}

export async function getSavedSearchResults(id: string) {
  return unwrap(
    (await userApi()).GET('/v1/me/saved-searches/{id}/results', {
      params: { path: { id }, query: { limit: 30 } },
    }),
  );
}

export async function getReferral(): Promise<Referral> {
  return unwrap((await userApi()).GET('/v1/me/referral'));
}

export async function getSessions() {
  return unwrap((await userApi()).GET('/v1/me/sessions'));
}

export async function getPreferences() {
  return unwrap((await userApi()).GET('/v1/me/notification-preferences'));
}

export async function getBlocked() {
  return unwrap((await userApi()).GET('/v1/me/blocks'));
}
