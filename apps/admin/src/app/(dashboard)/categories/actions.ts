'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';
import { fieldErrors } from '@/lib/errors';

export interface CategoryFormState {
  error?: string;
  fields?: Record<string, string>;
  done?: string;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

async function run(op: () => Promise<unknown>, done: string): Promise<CategoryFormState> {
  try {
    await op();
  } catch (err) {
    if (err instanceof ApiRequestError)
      return { error: err.message, fields: fieldErrors(err.error) };
    throw err;
  }
  revalidatePath('/categories');
  return { done };
}

export async function createCategoryAction(
  _: CategoryFormState,
  form: FormData,
): Promise<CategoryFormState> {
  const body = { name: text(form, 'name'), slug: text(form, 'slug'), icon: text(form, 'icon') };
  return run(
    async () => unwrap((await adminApi()).POST('/v1/admin/categories', { body })),
    `Added “${body.name}”.`,
  );
}

export async function updateCategoryAction(
  _: CategoryFormState,
  form: FormData,
): Promise<CategoryFormState> {
  const id = text(form, 'id');
  const active = form.get('isActive');
  const body = active
    ? { isActive: active === 'true' }
    : { name: text(form, 'name'), slug: text(form, 'slug'), icon: text(form, 'icon') };
  return run(
    async () =>
      unwrap(
        (await adminApi()).PATCH('/v1/admin/categories/{id}', { params: { path: { id } }, body }),
      ),
    'Saved.',
  );
}

/** Moves one category up or down by swapping it with its neighbour. */
export async function moveCategoryAction(
  _: CategoryFormState,
  form: FormData,
): Promise<CategoryFormState> {
  const ids = text(form, 'order').split(',');
  const i = ids.indexOf(text(form, 'id'));
  const j = form.get('direction') === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return {};
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  return run(
    async () => unwrap((await adminApi()).PUT('/v1/admin/categories/order', { body: { ids } })),
    'Order saved.',
  );
}
