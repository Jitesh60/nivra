/**
 * Writes the OpenAPI document to packages/api-client/openapi.json without a
 * database or Redis: the app is built in Nest "preview" mode, which reads
 * controller metadata but never instantiates providers or opens connections.
 *
 *   pnpm --filter @sajha/api openapi:export
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// ConfigModule validates env at import time; placeholders are enough here.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://x:x@localhost:5432/x',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  JWT_ADMIN_ACCESS_SECRET: 'y'.repeat(32),
  OTP_PEPPER: 'z'.repeat(32),
  TOTP_ENC_KEY: Buffer.alloc(32).toString('base64'),
});

const { AppModule } = await import('../app.module.js');
const app = await NestFactory.create(AppModule, { preview: true, logger: ['error'] });
app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

const doc = SwaggerModule.createDocument(
  app,
  new DocumentBuilder()
    .setTitle('Sajha API')
    .setDescription('REST API for the Sajha mobile app, admin panel and website.')
    .setVersion('1')
    .addBearerAuth()
    .build(),
);

const out = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/api-client/openapi.json',
);
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote ${Object.keys(doc.paths).length} paths to ${out}`);
await app.close();
