import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import { http } from './auth.js';

/** A small real JPEG with EXIF/GPS, like a phone photo. */
export function photo(width = 1200, height = 800, color = '#1DA482'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .withExif({
      IFD0: { Make: 'TestPhone' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '18/1 31/1 0/1' },
    })
    .jpeg()
    .toBuffer();
}

/** POST /v1/uploads, then PUT the bytes to the presigned URL. Returns the upload key. */
export async function upload(
  app: INestApplication,
  accessToken: string,
  purpose: 'AVATAR' | 'DOCUMENT' | 'LISTING_PHOTO' | 'CHAT_IMAGE',
  bytes: Buffer,
  contentType = 'image/jpeg',
): Promise<string> {
  const ticket = await http(app)
    .post('/v1/uploads')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ purpose, contentType, sizeBytes: bytes.length })
    .expect(201);
  const res = await fetch(ticket.body.url, {
    method: 'PUT',
    headers: ticket.body.headers,
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`Presigned PUT failed: ${res.status} ${await res.text()}`);
  return ticket.body.key as string;
}
