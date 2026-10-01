'use server';

import { revalidatePath } from 'next/cache';
import { attempt, unwrap, userApi } from './api';
import { hasSession } from './session';

export type SaveResult =
  { ok: true; saved: boolean } | { ok: false; signIn?: true; error?: string };

/** Adds or removes a listing from the wishlist. Guests are asked to sign in first. */
export async function setSavedAction(listingId: string, save: boolean): Promise<SaveResult> {
  if (!(await hasSession())) return { ok: false, signIn: true };
  const api = await userApi();
  const params = { params: { path: { listingId } } };
  const result = await attempt(() =>
    unwrap(
      save
        ? api.PUT('/v1/me/favorites/{listingId}', params)
        : api.DELETE('/v1/me/favorites/{listingId}', params),
    ),
  );
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.apiError.code === 'FAVORITE_OWN_LISTING'
          ? 'This is your own listing.'
          : result.error,
    };
  }
  revalidatePath('/wishlist');
  return { ok: true, saved: save };
}
