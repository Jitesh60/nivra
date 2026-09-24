import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import { generate } from 'otplib';
import request from 'supertest';
import { encrypt } from '../../src/common/crypto/crypto.js';
import type { AdminRole } from '../../src/generated/prisma/client.js';
import { hashPassword } from '../../src/modules/admin-auth/password.js';
import { newTotpSecret } from '../../src/modules/admin-auth/totp.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { REDIS } from '../../src/redis/redis.module.js';
import { TEST_ENV } from '../create-test-app.js';
import type { InMemorySmsProvider } from './in-memory-sms.js';

let phoneCounter = 0;
/** A fresh, valid Indian mobile number (E.164) per call, unique per test process. */
export function uniquePhone(): string {
  phoneCounter += 1;
  const suffix = String((process.pid * 1000 + phoneCounter) % 100_000_000).padStart(8, '0');
  return `+9198${suffix}`;
}

let emailCounter = 0;
export function uniqueEmail(prefix = 'user'): string {
  emailCounter += 1;
  return `${prefix}.${process.pid}.${emailCounter}@example.com`;
}

export const http = (app: INestApplication) => request(app.getHttpServer());

export async function flushRedis(app: INestApplication): Promise<void> {
  await app.get<Redis>(REDIS).flushdb();
}

export interface UserSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  phone: string;
}

/** Full phone-OTP login. Returns tokens for a new or existing user. */
export async function loginUser(
  app: INestApplication,
  sms: InMemorySmsProvider,
  phone = uniquePhone(),
  deviceId = `device-${Math.random().toString(36).slice(2, 10)}`,
): Promise<UserSession & { isNewUser: boolean }> {
  const issued = await http(app).post('/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await http(app)
    .post('/v1/auth/otp/verify')
    .send({
      challengeId: issued.body.challengeId,
      code: sms.lastCodeFor(phone),
      deviceId,
      platform: 'android',
    })
    .expect(200);
  // Let the next login for this number skip the 30s resend cooldown.
  await app.get<Redis>(REDIS).del(`otp:cooldown:LOGIN:${phone}`);
  return {
    userId: res.body.user.id,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    phone,
    isNewUser: res.body.isNewUser,
  };
}

export interface TestAdmin {
  id: string;
  email: string;
  password: string;
  totpSecret: string;
}

/** Inserts an admin directly. With `withTotp`, 2FA is already enabled. */
export async function createAdmin(
  app: INestApplication,
  role: AdminRole,
  opts: { withTotp?: boolean; mustChangePassword?: boolean } = {},
): Promise<TestAdmin> {
  const email = uniqueEmail(role.toLowerCase());
  const password = 'correct horse battery staple';
  const totpSecret = newTotpSecret();
  const key = Buffer.from(TEST_ENV.TOTP_ENC_KEY, 'base64');
  const admin = await app.get(PrismaService).adminUser.create({
    data: {
      email,
      name: `Test ${role}`,
      role,
      passwordHash: await hashPassword(password),
      mustChangePassword: opts.mustChangePassword ?? false,
      ...(opts.withTotp !== false
        ? { totpSecretEnc: encrypt(totpSecret, key), totpEnabledAt: new Date() }
        : {}),
    },
  });
  return { id: admin.id, email, password, totpSecret };
}

/** Password + TOTP login for an admin created with 2FA enabled. */
export async function loginAdmin(app: INestApplication, admin: TestAdmin) {
  const step1 = await http(app)
    .post('/v1/admin/auth/login')
    .send({ email: admin.email, password: admin.password })
    .expect(200);
  const res = await http(app)
    .post('/v1/admin/auth/2fa/verify')
    .send({ mfaToken: step1.body.mfaToken, code: await generate({ secret: admin.totpSecret }) })
    .expect(200);
  return res.body as { accessToken: string; refreshToken: string; admin: { id: string } };
}
