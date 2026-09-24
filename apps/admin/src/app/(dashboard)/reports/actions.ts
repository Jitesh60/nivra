'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';

export interface ReportActionState {
  error?: string;
  done?: string;
}

export async function resolveReportAction(
  _: ReportActionState,
  form: FormData,
): Promise<ReportActionState> {
  const id = String(form.get('id'));
  const outcome = String(form.get('outcome'));
  const note = String(form.get('note') ?? '').trim();
  if (outcome !== 'ACTIONED' && outcome !== 'DISMISSED') return { error: 'Pick an outcome.' };
  if (note.length < 3) return { error: 'Add a short note for the record.' };
  try {
    await unwrap(
      (await adminApi()).POST('/v1/admin/reports/{id}/resolve', {
        params: { path: { id } },
        body: { outcome, note },
      }),
    );
  } catch (err) {
    if (err instanceof ApiRequestError) return { error: err.message };
    throw err;
  }
  revalidatePath('/reports', 'layout');
  return { done: outcome === 'ACTIONED' ? 'Closed as actioned.' : 'Dismissed.' };
}
