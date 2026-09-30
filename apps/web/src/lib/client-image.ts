/**
 * Shrinks a photo in the browser before it's uploaded: longest side at most
 * `max` px, re-encoded as JPEG. Phone photos (5–12 MB) become a few hundred
 * KB, which keeps uploads fast and under the server's body limit. Files that
 * are already small and not HEIC-ish pass through untouched.
 */
export async function shrinkImage(file: File, max = 2048, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const small =
    file.size < 600 * 1024 && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  if (small && scale === 1) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) return file;
  const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
}
