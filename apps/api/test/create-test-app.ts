import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';
import { InMemorySmsProvider } from './helpers/in-memory-sms.js';

export interface TestApp {
  app: INestApplication;
  sms: InMemorySmsProvider;
}

/** Test-only secrets. */
export const TEST_ENV = {
  JWT_ACCESS_SECRET: 'test-user-access-secret-0123456789abcdef',
  JWT_ADMIN_ACCESS_SECRET: 'test-admin-access-secret-0123456789abcdef',
  OTP_PEPPER: 'test-otp-pepper-0123456789abcdef0123456789',
  TOTP_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
};

/**
 * Boots the real AppModule against the Testcontainers services.
 * SMS is captured in memory; email goes over SMTP to a real Mailpit container.
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
    ...TEST_ENV,
  });

  const { AppModule } = await import('../src/app.module.js');
  const { configureApp } = await import('../src/app.setup.js');
  const { SmsProvider } = await import('../src/providers/sms/sms.provider.js');

  const sms = new InMemorySmsProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SmsProvider)
    .useValue(sms)
    .compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return { app, sms };
}
