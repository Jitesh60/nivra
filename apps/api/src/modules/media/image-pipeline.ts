import sharp from 'sharp';

export type ImageFormat = 'jpeg' | 'png' | 'webp';

/** Identifies an image by its first bytes. Never trust the declared Content-Type. */
export function sniffImage(bytes: Buffer): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** Refuse decompression bombs: 40 megapixels is well above any phone camera. */
const MAX_INPUT_PIXELS = 40_000_000;

function load(bytes: Buffer) {
  // rotate() applies the EXIF orientation; sharp drops all metadata (EXIF, GPS,
  // XMP) on output unless asked to keep it. Re-encoding also neutralises files
  // that are "valid images" and something else at the same time.
  return sharp(bytes, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).rotate();
}

/** 512×512 square WebP, centre-cropped. */
export function processAvatar(bytes: Buffer): Promise<Buffer> {
  return load(bytes)
    .resize(512, 512, { fit: 'cover', position: 'attention' })
    .webp({ quality: 82 })
    .toBuffer();
}

export interface ListingPhotoVariants {
  /** Longest side ≤ 1600 px WebP, for the detail gallery. */
  full: Buffer;
  /** Longest side ≤ 480 px WebP, for cards and lists. */
  thumb: Buffer;
  width: number;
  height: number;
}

/** Listing photo: a gallery-size and a card-size WebP from one decode. */
export async function processListingPhoto(bytes: Buffer): Promise<ListingPhotoVariants> {
  const base = load(bytes);
  const [full, thumb] = await Promise.all([
    base
      .clone()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true }),
    base
      .clone()
      .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer(),
  ]);
  return { full: full.data, thumb, width: full.info.width, height: full.info.height };
}

/** Readable JPEG, longest side at most 2400 px (enough to read small print on an ID). */
export function processDocument(bytes: Buffer): Promise<Buffer> {
  return load(bytes)
    .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
