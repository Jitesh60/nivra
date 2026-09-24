'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';
import { fieldErrors } from '@/lib/errors';

export interface InviteState {
  error?: string;
  fields?: Record<string, string>;
  invited?: { email: string; temporaryPassword: string };
}

export async function inviteAdminAction(_: InviteState, form: FormData): Promise<InviteState> {
  const role = String(form.get('role')) as 'SUPER_ADMIN' | 'OPS' | 'SUPPORT';
  try {
    const api = await adminApi();
    const result = await unwrap(
      api.POST('/v1/admin/admins', {
        body: {
          email: String(form.get('email') ?? ''),
          name: String(form.get('name') ?? ''),
          role,
        },
      }),
    );
    revalidatePath('/admins');
    return { invited: { email: result.admin.email, temporaryPassword: result.temporaryPassword } };
  } catch (err) {
    if (err instanceof ApiRequestError)
      return { error: err.message, fields: fieldErrors(err.error) };
    throw err;
  }
}

export interface RowState {
  error?: string;
}

export async function updateAdminAction(_: RowState, form: FormData): Promise<RowState> {
  const id = String(form.get('id'));
  const role = form.get('role');
  const status = form.get('status');
  try {
    const api = await adminApi();
    await unwrap(
      api.PATCH('/v1/admin/admins/{id}', {
        params: { path: { id } },
        body: {
          ...(role ? { role: String(role) as 'SUPER_ADMIN' | 'OPS' | 'SUPPORT' } : {}),
          ...(status ? { status: String(status) as 'ACTIVE' | 'DISABLED' } : {}),
        },
      }),
    );
    revalidatePath('/admins');
    return {};
  } catch (err) {
    if (err instanceof ApiRequestError) return { error: err.message };
    throw err;
  }
}
