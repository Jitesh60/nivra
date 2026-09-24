'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';
import { fieldErrors } from '@/lib/errors';

export interface PasswordState {
  error?: string;
  fields?: Record<string, string>;
  done?: boolean;
}

export async function changePasswordAction(
  _: PasswordState,
  form: FormData,
): Promise<PasswordState> {
  const currentPassword = String(form.get('currentPassword') ?? '');
  const newPassword = String(form.get('newPassword') ?? '');
  if (newPassword !== String(form.get('confirmPassword') ?? '')) {
    return { fields: { confirmPassword: 'Passwords don’t match' } };
  }
  try {
    const api = await adminApi();
    await unwrap(api.POST('/v1/admin/me/password', { body: { currentPassword, newPassword } }));
  } catch (err) {
    if (err instanceof ApiRequestError)
      return { error: err.message, fields: fieldErrors(err.error) };
    throw err;
  }
  if (form.get('forced') === '1') {
    // The dashboard layout hid the menu while the change was pending; layouts
    // survive navigation, so refresh it before leaving.
    revalidatePath('/', 'layout');
    redirect('/');
  }
  revalidatePath('/account');
  return { done: true };
}

export async function revokeSessionAction(form: FormData): Promise<void> {
  const api = await adminApi();
  await unwrap(
    api.DELETE('/v1/admin/me/sessions/{id}', { params: { path: { id: String(form.get('id')) } } }),
  );
  revalidatePath('/account');
}
