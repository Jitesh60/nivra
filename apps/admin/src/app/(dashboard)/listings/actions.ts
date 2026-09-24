'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';

export interface ListingActionState {
  error?: string;
  done?: string;
}

async function act(
  id: string,
  run: () => Promise<unknown>,
  done: string,
): Promise<ListingActionState> {
  try {
    await run();
  } catch (err) {
    if (err instanceof ApiRequestError) return { error: err.message };
    throw err;
  }
  revalidatePath('/listings', 'layout');
  revalidatePath(`/listings/${id}`);
  return { done };
}

function reasonOf(form: FormData): string {
  return String(form.get('reason') ?? '').trim();
}

export async function approveListingAction(
  _: ListingActionState,
  form: FormData,
): Promise<ListingActionState> {
  const id = String(form.get('id'));
  return act(
    id,
    async () =>
      unwrap(
        (await adminApi()).POST('/v1/admin/listings/{id}/approve', { params: { path: { id } } }),
      ),
    'Approved. The listing is live, and this lender’s next listings skip review.',
  );
}

export async function rejectListingAction(
  _: ListingActionState,
  form: FormData,
): Promise<ListingActionState> {
  const id = String(form.get('id'));
  const reason = reasonOf(form);
  if (reason.length < 3) return { error: 'Tell the lender what to fix.' };
  return act(
    id,
    async () =>
      unwrap(
        (await adminApi()).POST('/v1/admin/listings/{id}/reject', {
          params: { path: { id } },
          body: { reason },
        }),
      ),
    'Sent back to the lender with your reason.',
  );
}

export async function unpublishListingAction(
  _: ListingActionState,
  form: FormData,
): Promise<ListingActionState> {
  const id = String(form.get('id'));
  const reason = reasonOf(form);
  if (reason.length < 3) return { error: 'Add a reason. The lender sees it.' };
  return act(
    id,
    async () =>
      unwrap(
        (await adminApi()).POST('/v1/admin/listings/{id}/unpublish', {
          params: { path: { id } },
          body: { reason },
        }),
      ),
    'Unpublished. Borrowers can no longer see it.',
  );
}

export async function changeCategoryAction(
  _: ListingActionState,
  form: FormData,
): Promise<ListingActionState> {
  const id = String(form.get('id'));
  const categoryId = String(form.get('categoryId'));
  return act(
    id,
    async () =>
      unwrap(
        (await adminApi()).PATCH('/v1/admin/listings/{id}/category', {
          params: { path: { id } },
          body: { categoryId },
        }),
      ),
    'Category updated.',
  );
}
