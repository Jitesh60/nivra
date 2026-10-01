'use server';

import { revalidatePath } from 'next/cache';
import { attempt, unwrap, userApi } from '@/lib/api';
import { formFiles, uploadImage } from '@/lib/upload';

export interface FormState {
  error?: string;
  success?: string;
}

type DocType =
  | 'AADHAAR_MASKED'
  | 'PAN'
  | 'DRIVING_LICENCE'
  | 'PASSPORT'
  | 'VOTER_ID'
  | 'COLLEGE_ID'
  | 'EMPLOYEE_ID'
  | 'ADDRESS_PROOF'
  | 'OTHER';

export async function addDocumentAction(form: FormData): Promise<FormState> {
  const type = String(form.get('type') ?? '') as DocType;
  const [front] = formFiles(form, 'front');
  const [back] = formFiles(form, 'back');
  if (!type) return { error: 'Choose the document type.' };
  if (!front) return { error: 'Add a photo of the front.' };
  const label = String(form.get('label') ?? '').trim() || undefined;
  const expiresOn = String(form.get('expiresOn') ?? '') || undefined;
  const result = await attempt(async () => {
    const frontKey = await uploadImage(front, 'DOCUMENT');
    const backKey = back ? await uploadImage(back, 'DOCUMENT') : undefined;
    return unwrap(
      (await userApi()).POST('/v1/me/documents', {
        body: { type, frontKey, backKey, label, expiresOn },
      }),
    );
  });
  if (!result.ok) {
    return {
      error:
        result.apiError.code === 'DOCUMENT_ALREADY_EXISTS'
          ? 'You already have this document. Delete the old one first.'
          : result.error,
    };
  }
  revalidatePath('/documents');
  return { success: 'Added. Our team checks it, usually within a day.' };
}

export async function deleteDocumentAction(id: string): Promise<FormState> {
  const result = await attempt(async () =>
    unwrap((await userApi()).DELETE('/v1/me/documents/{id}', { params: { path: { id } } })),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath('/documents');
  return { success: 'Deleted.' };
}
