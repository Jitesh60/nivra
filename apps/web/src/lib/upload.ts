import 'server-only';
import { ApiRequestError, unwrap, userApi } from './api';

export type UploadPurpose =
  'AVATAR' | 'DOCUMENT' | 'LISTING_PHOTO' | 'CHAT_IMAGE' | 'CONDITION_PHOTO';
const TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type ImageType = (typeof TYPES)[number];

/** Largest file the API signs for (the browser downsizes photos first). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Stores one image for the signed-in user and returns its upload key: asks the
 * API for a presigned URL, then PUTs the bytes from this server. The browser
 * never talks to storage, so the bucket needs no CORS rules.
 */
export async function uploadImage(file: File, purpose: UploadPurpose): Promise<string> {
  if (!TYPES.includes(file.type as ImageType)) {
    throw new ApiRequestError({ code: 'UPLOAD_TYPE', message: 'Use a JPEG, PNG or WebP image.' });
  }
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new ApiRequestError({ code: 'UPLOAD_SIZE', message: 'Images must be under 10 MB.' });
  }
  const api = await userApi();
  const ticket = await unwrap(
    api.POST('/v1/uploads', {
      body: { purpose, contentType: file.type as ImageType, sizeBytes: file.size },
    }),
  );
  let res: Response;
  try {
    res = await fetch(ticket.url, {
      method: 'PUT',
      headers: ticket.headers as Record<string, string>,
      body: Buffer.from(await file.arrayBuffer()),
      cache: 'no-store',
    });
  } catch {
    throw new ApiRequestError({ code: 'NETWORK', message: 'Upload failed' });
  }
  if (!res.ok) {
    throw new ApiRequestError({
      code: 'UPLOAD_FAILED',
      message: 'Upload failed. Please try again.',
    });
  }
  return ticket.key;
}

/** The files in a form field, ignoring the empty entry browsers send for "no file". */
export function formFiles(form: FormData, name: string): File[] {
  return form.getAll(name).filter((v): v is File => v instanceof File && v.size > 0);
}
