import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';

export type Bucket = 'public' | 'private';

export interface PresignedUpload {
  url: string;
  /** Headers the client must send with the PUT; they are part of the signature. */
  headers: Record<string, string>;
  expiresInSec: number;
}

/**
 * Thin wrapper over S3 (SeaweedFS locally). Two buckets:
 * - public: processed avatars (and later listing photos), served via S3_PUBLIC_BASE_URL
 * - private: identity documents and every raw upload (`tmp/…`); only signed URLs
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly s3: S3Client;
  private readonly buckets: Record<Bucket, string>;
  private readonly publicBaseUrl: string;
  private readonly privateSse?: ServerSideEncryption;

  constructor(config: ConfigService<Env, true>) {
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    this.s3 = new S3Client({
      region: config.get('S3_REGION', { infer: true }),
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
      },
      // Don't add CRC checksums to presigned PUTs: clients (and SeaweedFS) don't send them.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.buckets = {
      public: config.get('S3_PUBLIC_BUCKET', { infer: true }),
      private: config.get('S3_PRIVATE_BUCKET', { infer: true }),
    };
    this.publicBaseUrl = config.get('S3_PUBLIC_BASE_URL', { infer: true }).replace(/\/$/, '');
    const sse = config.get('S3_PRIVATE_SSE', { infer: true });
    this.privateSse = sse === 'none' ? undefined : sse;
  }

  /**
   * URL the client PUTs a file to. Content-Type and Content-Length are signed,
   * so uploading a different type or size fails at the storage layer.
   */
  async presignPut(
    bucket: Bucket,
    key: string,
    contentType: string,
    contentLength: number,
    expiresInSec = 300,
  ): Promise<PresignedUpload> {
    const url = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.buckets[bucket],
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      { expiresIn: expiresInSec, signableHeaders: new Set(['content-type', 'content-length']) },
    );
    return { url, headers: { 'Content-Type': contentType }, expiresInSec };
  }

  /** Short-lived, uncached read URL for a private object. */
  presignGet(key: string, expiresInSec = 300): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.buckets.private,
        Key: key,
        ResponseCacheControl: 'no-store, private',
        ResponseContentDisposition: 'inline',
      }),
      { expiresIn: expiresInSec },
    );
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** Size and type of an object, or null if it doesn't exist. */
  async head(bucket: Bucket, key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const res = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
      );
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (err) {
      if (err instanceof NotFound || (err as { name?: string }).name === 'NotFound') return null;
      throw err;
    }
  }

  async getBytes(bucket: Bucket, key: string): Promise<Buffer> {
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async put(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.buckets[bucket],
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: bucket === 'public' ? 'public, max-age=31536000, immutable' : 'no-store',
        ...(bucket === 'private' && this.privateSse
          ? { ServerSideEncryption: this.privateSse }
          : {}),
      }),
    );
  }

  async delete(bucket: Bucket, keys: (string | null | undefined)[]): Promise<void> {
    const objects = keys.filter((k): k is string => !!k).map((Key) => ({ Key }));
    if (objects.length === 0) return;
    await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.buckets[bucket],
        Delete: { Objects: objects, Quiet: true },
      }),
    );
  }

  onModuleDestroy(): void {
    this.s3.destroy();
  }
}
