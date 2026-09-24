import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';
import type { FakePaymentProvider } from '../src/providers/payments/fake-payment.provider.js';
import { InMemoryPushProvider } from './helpers/in-memory-push.js';
import { InMemorySmsProvider } from './helpers/in-memory-sms.js';

export interface TestApp {
  app: INestApplication;
  sms: InMemorySmsProvider;
  push: InMemoryPushProvider;
  /** The fake Razorpay (PAYMENT_PROVIDER=fake): records calls, can fail on demand. */
  payments: FakePaymentProvider;
}

/** Test-only secrets. */
export const TEST_ENV = {
  JWT_ACCESS_SECRET: 'test-user-access-secret-0123456789abcdef',
  JWT_ADMIN_ACCESS_SECRET: 'test-admin-access-secret-0123456789abcdef',
  OTP_PEPPER: 'test-otp-pepper-0123456789abcdef0123456789',
  TOTP_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
  ADDRESS_ENC_KEY: Buffer.alloc(32, 9).toString('base64'),
};

/**
 * Boots the real AppModule against the Testcontainers services.
 * SMS and push are captured in memory; email goes over SMTP to a real Mailpit
 * container. Socket tests call `app.listen(0)` to get a port.
 * Env vars are set before AppModule is imported because ConfigModule validates at import time.
 */
export async function createTestApp(): Promise<TestApp> {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    SWAGGER_ENABLED: 'true',
    CORS_ORIGINS: 'http://localhost:3001',
    DATABASE_URL: inject('databaseUrl'),
    REDIS_URL: inject('redisUrl'),
    SMS_PROVIDER: 'console',
    EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: inject('smtpHost'),
    SMTP_PORT: String(inject('smtpPort')),
    OTP_DEV_BYPASS_CODE: '',
    S3_ENDPOINT: inject('s3Endpoint'),
    S3_REGION: 'ap-south-1',
    S3_ACCESS_KEY_ID: 'sajha',
    S3_SECRET_ACCESS_KEY: 'sajha-s3-secret',
    S3_FORCE_PATH_STYLE: 'true',
    S3_PUBLIC_BUCKET: 'sajha-public-media',
    S3_PRIVATE_BUCKET: 'sajha-private-docs',
    S3_PUBLIC_BASE_URL: `${inject('s3Endpoint')}/sajha-public-media`,
    S3_PRIVATE_SSE: 'none',
    // Tests run booking jobs directly (BookingWorker.process) instead of waiting for delays.
    JOBS_WORKER: 'false',
    PAYMENT_PROVIDER: 'fake',
    // Suites share 127.0.0.1; the rate-limit test fills one forwarded IP's counter instead.
    PUBLIC_READ_LIMIT_PER_MIN: '100000',
    ...TEST_ENV,
  });

  const { AppModule } = await import('../src/app.module.js');
  const { configureApp } = await import('../src/app.setup.js');
  const { SmsProvider } = await import('../src/providers/sms/sms.provider.js');
  const { PushProvider } = await import('../src/providers/push/push.provider.js');
  const { PaymentProvider } = await import('../src/providers/payments/payment.provider.js');

  const sms = new InMemorySmsProvider();
  const push = new InMemoryPushProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SmsProvider)
    .useValue(sms)
    .overrideProvider(PushProvider)
    .useValue(push)
    .compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false, rawBody: true }));
  await app.init();
  const payments = app.get(PaymentProvider) as FakePaymentProvider;
  return { app, sms, push, payments };
}
