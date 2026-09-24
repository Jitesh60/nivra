import sharp from 'sharp';
import {
  processAvatar,
  processDocument,
  processListingPhoto,
  sniffImage,
} from './image-pipeline.js';

async function jpegWithGps(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#1DA482' } })
    .withExif({
      IFD0: { Make: 'TestCam', Model: 'X1' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '18/1 31/1 0/1' },
    })
    .jpeg()
    .toBuffer();
}

describe('image pipeline', () => {
  it('recognises formats from magic bytes, not names', async () => {
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
      .jpeg()
      .toBuffer();
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const webp = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
      .webp()
      .toBuffer();
    expect(sniffImage(jpeg)).toBe('jpeg');
    expect(sniffImage(png)).toBe('png');
    expect(sniffImage(webp)).toBe('webp');
    expect(sniffImage(Buffer.from('<?php echo 1; ?>'))).toBeNull();
    expect(sniffImage(Buffer.from('%PDF-1.7'))).toBeNull();
  });

  it('makes a 512×512 WebP avatar without metadata', async () => {
    const input = await jpegWithGps(1200, 800);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const out = await processAvatar(input);
    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 512, height: 512 });
    expect(meta.exif).toBeUndefined();
  });

  it('keeps documents readable but bounded, and strips GPS', async () => {
    const out = await processDocument(await jpegWithGps(4000, 3000));
    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 2400, height: 1800 });
    expect(meta.exif).toBeUndefined();

    const small = await sharp(await processDocument(await jpegWithGps(800, 600))).metadata();
    expect(small).toMatchObject({ width: 800, height: 600 }); // never enlarged
  });

  it('rejects bytes that only look like an image', async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('not really a jpeg')]);
    await expect(processDocument(fake)).rejects.toThrow();
  });

  it('makes gallery and thumbnail WebPs for listing photos, without metadata', async () => {
    const out = await processListingPhoto(await jpegWithGps(3000, 2000));
    expect(out).toMatchObject({ width: 1600, height: 1067 });
    const full = await sharp(out.full).metadata();
    const thumb = await sharp(out.thumb).metadata();
    expect(full).toMatchObject({ format: 'webp', width: 1600, height: 1067 });
    expect(thumb).toMatchObject({ format: 'webp', width: 480, height: 320 });
    expect(full.exif).toBeUndefined();

    // Small photos are not upscaled.
    expect(await processListingPhoto(await jpegWithGps(800, 600))).toMatchObject({
      width: 800,
      height: 600,
    });
  });
});
