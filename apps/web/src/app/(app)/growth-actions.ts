'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { attempt, unwrap, userApi } from '@/lib/api';
import type { BrowseQuery } from '@/lib/discovery';
import { clearSession } from '@/lib/session';

export interface Result {
  error?: string;
  success?: string;
}

// ── Requests board ──

export async function createRequestAction(form: FormData): Promise<Result> {
  const title = String(form.get('title') ?? '').trim();
  const details = String(form.get('details') ?? '').trim();
  const lat = Number(form.get('lat'));
  const lng = Number(form.get('lng'));
  const areaLabel = String(form.get('areaLabel') ?? '').trim();
  if (title.length < 3) return { error: 'Say what you’re looking for.' };
  if (details.length < 10) return { error: 'Add a few details (dates, size, use).' };
  if (!form.get('lat') || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: 'Set where you need it: use your location or drop a pin.' };
  }
  if (areaLabel.length < 2) return { error: 'Name the area, e.g. “Kothrud, Pune”.' };
  const budget = Number(form.get('budget') ?? '');
  const startDate = String(form.get('startDate') ?? '') || undefined;
  const endDate = String(form.get('endDate') ?? '') || undefined;
  const categoryId = String(form.get('categoryId') ?? '') || undefined;
  const result = await attempt(async () =>
    unwrap(
      (await userApi()).POST('/v1/requests', {
        body: {
          title,
          details,
          lat,
          lng,
          areaLabel,
          categoryId,
          startDate,
          endDate,
          budgetPerDayPaise: budget > 0 ? Math.round(budget * 100) : undefined,
        },
      }),
    ),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath('/requests');
  redirect(`/requests/${result.data.id}?posted=1`);
}

export async function respondToRequestAction(
  id: string,
  listingId: string,
  message: string,
): Promise<Result> {
  if (!listingId) return { error: 'Pick one of your listings.' };
  if (message.trim().length < 2) return { error: 'Add a short message.' };
  const result = await attempt(async () =>
    unwrap(
      (await userApi()).POST('/v1/requests/{id}/responses', {
        params: { path: { id } },
        body: { listingId, message: message.trim() },
      }),
    ),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath(`/requests/${id}`);
  return { success: 'Sent. They’ll see your listing and can chat with you.' };
}

export async function closeRequestAction(id: string): Promise<Result> {
  const result = await attempt(async () =>
    unwrap((await userApi()).POST('/v1/requests/{id}/close', { params: { path: { id } } })),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath(`/requests/${id}`);
  return { success: 'Closed.' };
}

// ── Saved searches ──

export async function saveSearchAction(
  query: BrowseQuery,
  name: string,
): Promise<Result & { signIn?: true }> {
  if (query.lat === undefined || query.lng === undefined) {
    return { error: 'Turn on “Near me” first: alerts are for an area.' };
  }
  const result = await attempt(async () =>
    unwrap(
      (await userApi()).POST('/v1/me/saved-searches', {
        body: {
          name: name.trim() || undefined,
          alertsEnabled: true,
          filters: {
            q: query.q,
            lat: query.lat!,
            lng: query.lng!,
            radiusKm: query.radiusKm ?? 5,
            categoryId: query.categoryId,
            minPricePaise: query.minPricePaise,
            maxPricePaise: query.maxPricePaise,
            condition: query.condition?.length ? query.condition : undefined,
            verifiedLendersOnly: query.verifiedLendersOnly,
          },
        },
      }),
    ),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath('/saved-searches');
  return { success: 'Saved. We’ll tell you when something new matches.' };
}

export async function setAlertsAction(id: string, alertsEnabled: boolean): Promise<Result> {
  const result = await attempt(async () =>
    unwrap(
      (await userApi()).PATCH('/v1/me/saved-searches/{id}', {
        params: { path: { id } },
        body: { alertsEnabled },
      }),
    ),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath('/saved-searches');
  return {};
}

export async function deleteSavedSearchAction(id: string): Promise<Result> {
  const result = await attempt(async () =>
    unwrap((await userApi()).DELETE('/v1/me/saved-searches/{id}', { params: { path: { id } } })),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath('/saved-searches');
  return {};
}

// ── Referrals ──

export async function redeemCodeAction(code: string): Promise<Result> {
  const clean = code.trim().toUpperCase();
  if (!clean) return { error: 'Enter the code.' };
  const result = await attempt(async () =>
    unwrap((await userApi()).POST('/v1/me/referral/redeem', { body: { code: clean } })),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath('/invite');
  return { success: 'Code applied: your credit is ready for your first booking.' };
}

// ── Settings ──

export async function revokeSessionAction(id: string): Promise<Result> {
  const result = await attempt(async () =>
    unwrap((await userApi()).DELETE('/v1/me/sessions/{id}', { params: { path: { id } } })),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath('/settings');
  return { success: 'Signed out that device.' };
}

type Prefs = {
  pushBookings: boolean;
  pushChat: boolean;
  pushReminders: boolean;
  emailBookings: boolean;
  smsReminders: boolean;
  marketing: boolean;
  pushSearchAlerts: boolean;
  pushRequests: boolean;
};

export async function savePreferencesAction(prefs: Partial<Prefs>): Promise<Result> {
  const result = await attempt(async () =>
    unwrap((await userApi()).PUT('/v1/me/notification-preferences', { body: prefs })),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath('/settings');
  return { success: 'Saved.' };
}

export async function unblockAction(userId: string): Promise<Result> {
  const result = await attempt(async () =>
    unwrap((await userApi()).DELETE('/v1/me/blocks/{userId}', { params: { path: { userId } } })),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath('/settings');
  return {};
}

export async function signOutEverywhereAction(): Promise<Result> {
  const result = await attempt(async () => unwrap((await userApi()).POST('/v1/auth/logout-all')));
  if (!result.ok) return { error: result.error };
  await clearSession();
  redirect('/login?reason=signedout');
}

export async function deleteAccountAction(confirmText: string): Promise<Result> {
  if (confirmText.trim().toUpperCase() !== 'DELETE') return { error: 'Type DELETE to confirm.' };
  const result = await attempt(async () => unwrap((await userApi()).DELETE('/v1/me')));
  if (!result.ok) {
    return {
      error:
        result.apiError.code === 'ACCOUNT_HAS_OPEN_BOOKINGS'
          ? 'Finish or cancel your open bookings first.'
          : result.error,
    };
  }
  await clearSession();
  redirect('/?deleted=1');
}
