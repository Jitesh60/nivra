import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { StorageService } from './storage.service.js';

function makeService(privateSse: Env['S3_PRIVATE_SSE']) {
  const values: Partial<Env> = {
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'auto',
    S3_FORCE_PATH_STYLE: true,
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret',
    S3_PUBLIC_BUCKET: 'public-media',
    S3_PRIVATE_BUCKET: 'private-docs',
    S3_PUBLIC_BASE_URL: 'https://media.example.com/',
    S3_PRIVATE_SSE: privateSse,
  };
  const config = { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
  const service = new StorageService(config);
  const send = vi.fn().mockResolvedValue({});
  (service as unknown as { s3: { send: typeof send } }).s3.send = send;
  return { service, send };
}

async function sentInput(privateSse: Env['S3_PRIVATE_SSE'], bucket: 'public' | 'private') {
  const { service, send } = makeService(privateSse);
  await service.put(bucket, 'docs/a.jpg', Buffer.from('x'), 'image/jpeg');
  const command = send.mock.calls[0][0] as PutObjectCommand;
  expect(command).toBeInstanceOf(PutObjectCommand);
  return command.input;
}

describe('StorageService private-bucket encryption', () => {
  it('asks S3 to encrypt private writes with AES256 or KMS', async () => {
    expect((await sentInput('AES256', 'private')).ServerSideEncryption).toBe('AES256');
    expect((await sentInput('aws:kms', 'private')).ServerSideEncryption).toBe('aws:kms');
  });

  it('sends no encryption header when the store encrypts on its own (Cloudflare R2)', async () => {
    expect((await sentInput('provider', 'private')).ServerSideEncryption).toBeUndefined();
  });

  it('sends no encryption header locally or for public media', async () => {
    expect((await sentInput('none', 'private')).ServerSideEncryption).toBeUndefined();
    expect((await sentInput('AES256', 'public')).ServerSideEncryption).toBeUndefined();
  });
});
