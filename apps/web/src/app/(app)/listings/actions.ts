'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { attempt, unwrap, userApi } from '@/lib/api';
import { fieldErrors } from '@/lib/errors';
import { formFiles, uploadImage } from '@/lib/upload';

export interface FormState {
  error?: string;
  success?: string;
  fields?: Record<string, string>;
}

type Condition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR';
type DocType = 'GOVERNMENT_ID' | 'COLLEGE_OR_EMPLOYEE_ID' | 'ADDRESS_PROOF' | 'OTHER';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const int = (form: FormData, name: string) => {
  const raw = text(form, name);
  if (raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : undefined;
};
const paise = (form: FormData, name: string) => {
  const rupees = int(form, name);
  return rupees === undefined ? undefined : rupees * 100;
};

/** The details form, shared by "new" and "edit". Field names match the API (₹ → paise). */
function detailsFrom(form: FormData) {
  return {
    categoryId: text(form, 'categoryId'),
    title: text(form, 'title'),
    description: text(form, 'description'),
    condition: text(form, 'condition') as Condition,
    brand: text(form, 'brand') || undefined,
    size: text(form, 'size') || undefined,
    pricePerDayPaise: paise(form, 'price') ?? 0,
    depositPaise: paise(form, 'deposit') ?? 0,
    weeklyDiscountPct: int(form, 'weeklyDiscountPct') ?? 0,
    minDays: int(form, 'minDays'),
    maxDays: int(form, 'maxDays'),
    advanceNoticeDays: int(form, 'advanceNoticeDays'),
  };
}

/** API field names → the form's names, so errors show under the right input. */
function formFields(errors: Record<string, string>): Record<string, string> {
  const rename: Record<string, string> = { pricePerDayPaise: 'price', depositPaise: 'deposit' };
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [rename[k] ?? k, v]));
}

const done = (id: string) => {
  revalidatePath('/listings');
  revalidatePath(`/listings/${id}`);
};

export async function createListingAction(_: FormState, form: FormData): Promise<FormState> {
  const body = detailsFrom(form);
  const api = await userApi();
  const result = await attempt(() => unwrap(api.POST('/v1/me/listings', { body })));
  if (!result.ok) return { error: result.error, fields: formFields(fieldErrors(result.apiError)) };
  revalidatePath('/listings');
  redirect(`/listings/${result.data.id}?created=1`);
}

export async function updateDetailsAction(
  id: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(
      api.PATCH('/v1/me/listings/{id}', { params: { path: { id } }, body: detailsFrom(form) }),
    ),
  );
  if (!result.ok) return { error: result.error, fields: formFields(fieldErrors(result.apiError)) };
  done(id);
  return { success: 'Details saved.' };
}

export async function addPhotosAction(id: string, form: FormData): Promise<FormState> {
  const files = formFiles(form, 'photos');
  if (!files.length) return { error: 'Choose at least one photo.' };
  const api = await userApi();
  for (const file of files) {
    const result = await attempt(async () => {
      const key = await uploadImage(file, 'LISTING_PHOTO');
      return unwrap(
        api.POST('/v1/me/listings/{id}/photos', { params: { path: { id } }, body: { key } }),
      );
    });
    if (!result.ok) {
      done(id);
      return {
        error:
          result.apiError.code === 'LISTING_PHOTO_LIMIT'
            ? 'You’ve reached the photo limit.'
            : result.error,
      };
    }
  }
  done(id);
  return { success: files.length === 1 ? 'Photo added.' : `${files.length} photos added.` };
}

export async function removePhotoAction(id: string, photoId: string): Promise<FormState> {
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(
      api.DELETE('/v1/me/listings/{id}/photos/{photoId}', { params: { path: { id, photoId } } }),
    ),
  );
  if (!result.ok) return { error: result.error };
  done(id);
  return {};
}

export async function reorderPhotosAction(id: string, ids: string[]): Promise<FormState> {
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(
      api.PUT('/v1/me/listings/{id}/photos/order', { params: { path: { id } }, body: { ids } }),
    ),
  );
  if (!result.ok) return { error: result.error };
  done(id);
  return {};
}

export async function savePickupAction(
  id: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const lat = Number(form.get('lat'));
  const lng = Number(form.get('lng'));
  if (!form.get('lat') || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { fields: { lat: 'Drop the pin where you hand the item over.' } };
  }
  const areaLabel = text(form, 'areaLabel');
  if (areaLabel.length < 2)
    return { fields: { areaLabel: 'Name the area, e.g. “Kothrud, Pune”.' } };
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(
      api.PATCH('/v1/me/listings/{id}', {
        params: { path: { id } },
        body: { lat, lng, areaLabel, exactAddress: text(form, 'exactAddress') || undefined },
      }),
    ),
  );
  if (!result.ok) return { error: result.error, fields: fieldErrors(result.apiError) };
  done(id);
  return { success: 'Pickup saved.' };
}

export async function saveBlocksAction(
  id: string,
  ranges: { startsOn: string; endsOn: string }[],
): Promise<FormState> {
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(api.PUT('/v1/me/listings/{id}/blocks', { params: { path: { id } }, body: { ranges } })),
  );
  if (!result.ok) return { error: result.error };
  done(id);
  return { success: 'Dates saved.' };
}

export async function saveDocsAction(id: string, _: FormState, form: FormData): Promise<FormState> {
  const items = form.getAll('docType').map((v) => {
    const docType = String(v) as DocType;
    const note = text(form, `note-${docType}`);
    return note ? { docType, note } : { docType };
  });
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(
      api.PUT('/v1/me/listings/{id}/required-docs', {
        params: { path: { id } },
        body: { items },
      }),
    ),
  );
  if (!result.ok) return { error: result.error };
  done(id);
  return { success: items.length ? 'Saved.' : 'Saved: no documents needed.' };
}

export async function publishAction(id: string): Promise<FormState> {
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(api.POST('/v1/me/listings/{id}/publish', { params: { path: { id } } })),
  );
  if (!result.ok) return { error: result.error };
  done(id);
  return {
    success: result.data.inReview
      ? 'Sent for review. Your first listing is checked by our team, usually within a day.'
      : 'Your listing is live.',
  };
}

export async function setPausedAction(id: string, paused: boolean): Promise<FormState> {
  const api = await userApi();
  const params = { params: { path: { id } } };
  const result = await attempt(() =>
    unwrap(
      paused
        ? api.POST('/v1/me/listings/{id}/pause', params)
        : api.POST('/v1/me/listings/{id}/unpause', params),
    ),
  );
  if (!result.ok) return { error: result.error };
  done(id);
  return { success: paused ? 'Paused: hidden from search.' : 'Live again.' };
}

export async function deleteListingAction(id: string): Promise<FormState> {
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(api.DELETE('/v1/me/listings/{id}', { params: { path: { id } } })),
  );
  if (!result.ok) {
    return {
      error:
        result.apiError.code === 'LISTING_HAS_OPEN_BOOKINGS'
          ? 'This listing has open bookings. Finish or cancel them first.'
          : result.error,
    };
  }
  revalidatePath('/listings');
  redirect('/listings?deleted=1');
}
