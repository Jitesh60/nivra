'use server';

import { revalidatePath } from 'next/cache';
import { attempt, unwrap, userApi } from '@/lib/api';
import { fieldErrors } from '@/lib/errors';
import { formFiles, uploadImage } from '@/lib/upload';

export interface FormState {
  error?: string;
  success?: string;
  fields?: Record<string, string>;
}

export async function saveProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get('name') ?? '').trim();
  if (name.length < 2) return { fields: { name: 'Enter your name.' } };
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(
      api.PATCH('/v1/me', {
        body: {
          name,
          city: String(form.get('city') ?? '').trim(),
          bio: String(form.get('bio') ?? '').trim(),
        },
      }),
    ),
  );
  if (!result.ok) return { error: result.error, fields: fieldErrors(result.apiError) };
  revalidatePath('/profile');
  return { success: 'Profile saved.' };
}

export async function setAvatarAction(form: FormData): Promise<FormState> {
  const [file] = formFiles(form, 'photo');
  if (!file) return { error: 'Choose a photo.' };
  const result = await attempt(async () => {
    const key = await uploadImage(file, 'AVATAR');
    return unwrap((await userApi()).PUT('/v1/me/avatar', { body: { key } }));
  });
  if (!result.ok) return { error: result.error };
  revalidatePath('/profile');
  return { success: 'Photo updated.' };
}

export async function removeAvatarAction(): Promise<FormState> {
  const result = await attempt(async () => unwrap((await userApi()).DELETE('/v1/me/avatar')));
  if (!result.ok) return { error: result.error };
  revalidatePath('/profile');
  return { success: 'Photo removed.' };
}
