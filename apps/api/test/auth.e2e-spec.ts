import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS } from '../src/redis/redis.module.js';
import { createTestApp } from './create-test-app.js';
import { flushRedis, http, loginUser, uniqueEmail, uniquePhone } from './helpers/auth.js';
import type { InMemorySmsProvider } from './helpers/in-memory-sms.js';
import { lastEmailCode } from './helpers/mailpit.js';

describe('User auth (e2e)', () => {
  let app: INestApplication;
  let sms: InMemorySmsProvider;
  let prisma: PrismaService;
  let redis: Redis;

  const requestOtp = (phone: string) => http(app).post('/v1/auth/otp/request').send({ phone });
  const verifyOtp = (challengeId: string, code: string) =>
    http(app)
      .post('/v1/auth/otp/verify')
      .send({ challengeId, code, deviceId: 'device-e2e-1', platform: 'android' });
  const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, sms } = await createTestApp());
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS);
  });

  beforeEach(async () => {
    await flushRedis(app);
    sms.fail = false;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('phone OTP login', () => {
    it('creates the user on first login and signs the same user in afterwards', async () => {
      const phone = uniquePhone();
      const first = await loginUser(app, sms, phone);
      expect(first.isNewUser).toBe(true);

      const me = await http(app).get('/v1/me').set(bearer(first.accessToken)).expect(200);
      expect(me.body.user).toMatchObject({
        id: first.userId,
        phone,
        phoneVerified: true,
        emailVerified: false,
        status: 'ACTIVE',
      });

      const second = await loginUser(app, sms, phone);
      expect(second.isNewUser).toBe(false);
      expect(second.userId).toBe(first.userId);
    });

    it('normalises common number formats', async () => {
      const phone = uniquePhone();
      const local = `0${phone.slice(3, 8)} ${phone.slice(8)}`;
      await requestOtp(local).expect(200);
      expect(sms.lastCodeFor(phone)).toMatch(/^\d{6}$/);
    });

    it('rejects numbers that are not Indian mobiles', async () => {
      const res = await requestOtp('+14155552671').expect(400);
      expect(res.body.error.code).toBe('PHONE_INVALID');
    });

    it('returns 503 and frees the cooldown when the SMS cannot be sent', async () => {
      const phone = uniquePhone();
      sms.fail = true;
      const res = await requestOtp(phone).expect(503);
      expect(res.body.error.code).toBe('OTP_DELIVERY_FAILED');
      sms.fail = false;
      await requestOtp(phone).expect(200);
    });

    it('counts wrong codes and blocks the challenge after 5 attempts', async () => {
      const phone = uniquePhone();
      const { body } = await requestOtp(phone).expect(200);
      const code = sms.lastCodeFor(phone);

      const first = await verifyOtp(body.challengeId, wrong(code)).expect(400);
      expect(first.body.error).toMatchObject({ code: 'OTP_INVALID', details: { attemptsLeft: 4 } });
      for (let i = 0; i < 3; i++) await verifyOtp(body.challengeId, wrong(code)).expect(400);

      const fifth = await verifyOtp(body.challengeId, wrong(code)).expect(429);
      expect(fifth.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');

      // Even the right code no longer works on this challenge.
      const after = await verifyOtp(body.challengeId, code).expect(429);
      expect(after.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
    });

    it('rejects expired codes', async () => {
      const phone = uniquePhone();
      const { body } = await requestOtp(phone).expect(200);
      await prisma.otpChallenge.update({
        where: { id: body.challengeId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await verifyOtp(body.challengeId, sms.lastCodeFor(phone)).expect(400);
      expect(res.body.error.code).toBe('OTP_EXPIRED');
    });

    it('does not accept the same code twice', async () => {
      const phone = uniquePhone();
      const { body } = await requestOtp(phone).expect(200);
      const code = sms.lastCodeFor(phone);
      await verifyOtp(body.challengeId, code).expect(200);
      const again = await verifyOtp(body.challengeId, code).expect(400);
      expect(again.body.error.code).toBe('OTP_EXPIRED');
    });

    it('a new code replaces the previous one', async () => {
      const phone = uniquePhone();
      const old = await requestOtp(phone).expect(200);
      const oldCode = sms.lastCodeFor(phone);
      await redis.del(`otp:cooldown:LOGIN:${phone}`);
      await requestOtp(phone).expect(200);
      const res = await verifyOtp(old.body.challengeId, oldCode).expect(400);
      expect(res.body.error.code).toBe('OTP_EXPIRED');
    });

    it('enforces the 30 second resend cooldown', async () => {
      const phone = uniquePhone();
      await requestOtp(phone).expect(200);
      const res = await requestOtp(phone).expect(429);
      expect(res.body.error.code).toBe('OTP_COOLDOWN');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect(res.body.error.details.retryAfterSec).toBeLessThanOrEqual(30);
    });

    it('allows 5 codes per number per hour', async () => {
      const phone = uniquePhone();
      for (let i = 0; i < 5; i++) {
        await requestOtp(phone).expect(200);
        await redis.del(`otp:cooldown:LOGIN:${phone}`);
      }
      const sixth = await requestOtp(phone).expect(429);
      expect(sixth.body.error.code).toBe('OTP_RATE_LIMITED');
    });

    it('allows 20 codes per IP per hour', async () => {
      for (let i = 0; i < 20; i++) await requestOtp(uniquePhone()).expect(200);
      const res = await requestOtp(uniquePhone()).expect(429);
      expect(res.body.error.code).toBe('OTP_RATE_LIMITED');
    });

    it('locks a number for an hour after 10 wrong codes', async () => {
      const phone = uniquePhone();
      for (let round = 0; round < 2; round++) {
        const { body } = await requestOtp(phone).expect(200);
        await redis.del(`otp:cooldown:LOGIN:${phone}`);
        const code = sms.lastCodeFor(phone);
        for (let i = 0; i < 5; i++) await verifyOtp(body.challengeId, wrong(code));
      }
      const res = await requestOtp(phone).expect(429);
      expect(res.body.error.code).toBe('OTP_RATE_LIMITED');
      expect(await redis.ttl(`otp:lock:${phone}`)).toBeGreaterThan(3500);
    });

    it('validates the request body', async () => {
      const res = await http(app)
        .post('/v1/auth/otp/verify')
        .send({ challengeId: 'nope', code: '12', extra: true })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(res.body.error.details)).toEqual(
        expect.arrayContaining(['challengeId', 'code', 'deviceId', 'extra']),
      );
    });
  });

  describe('email verification', () => {
    it('sends the code by email and marks the email verified', async () => {
      const user = await loginUser(app, sms);
      const email = uniqueEmail();
      const issued = await http(app)
        .post('/v1/auth/email/otp/request')
        .set(bearer(user.accessToken))
        .send({ email: `  ${email.toUpperCase()} ` })
        .expect(200);

      const code = await lastEmailCode(email);
      const res = await http(app)
        .post('/v1/auth/email/otp/verify')
        .set(bearer(user.accessToken))
        .send({ challengeId: issued.body.challengeId, code })
        .expect(200);
      expect(res.body.user).toMatchObject({ email, emailVerified: true });
    });

    it("rejects another account's email and another user's challenge", async () => {
      const owner = await loginUser(app, sms);
      const email = uniqueEmail();
      const issued = await http(app)
        .post('/v1/auth/email/otp/request')
        .set(bearer(owner.accessToken))
        .send({ email })
        .expect(200);

      const other = await loginUser(app, sms);
      const stolen = await http(app)
        .post('/v1/auth/email/otp/verify')
        .set(bearer(other.accessToken))
        .send({ challengeId: issued.body.challengeId, code: await lastEmailCode(email) })
        .expect(400);
      expect(stolen.body.error.code).toBe('OTP_INVALID');

      await http(app)
        .post('/v1/auth/email/otp/verify')
        .set(bearer(owner.accessToken))
        .send({ challengeId: issued.body.challengeId, code: await lastEmailCode(email) })
        .expect(200);

      const taken = await http(app)
        .post('/v1/auth/email/otp/request')
        .set(bearer(other.accessToken))
        .send({ email })
        .expect(409);
      expect(taken.body.error.code).toBe('EMAIL_IN_USE');
    });

    it('requires a signed-in user', async () => {
      const res = await http(app)
        .post('/v1/auth/email/otp/request')
        .send({ email: uniqueEmail() })
        .expect(401);
      expect(res.body.error.code).toBe('TOKEN_INVALID');
    });
  });

  describe('tokens and sessions', () => {
    it('rotates the refresh token on every use', async () => {
      const user = await loginUser(app, sms);
      const res = await http(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);
      expect(res.body.refreshToken).not.toBe(user.refreshToken);
      expect(res.body.expiresInSec).toBe(900);
      await http(app).get('/v1/me').set(bearer(res.body.accessToken)).expect(200);
    });

    it('revokes the whole session when an old refresh token is reused', async () => {
      const user = await loginUser(app, sms);
      const rotated = await http(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);

      const reuse = await http(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      expect(reuse.body.error.code).toBe('REFRESH_REUSED');

      // The attacker's copy is dead, and so is the legitimate newer token and access token.
      const newer = await http(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(401);
      expect(newer.body.error.code).toBe('TOKEN_INVALID');
      await http(app).get('/v1/me').set(bearer(rotated.body.accessToken)).expect(401);
    });

    it('only lets one of two concurrent refreshes win', async () => {
      const user = await loginUser(app, sms);
      const results = await Promise.all(
        [1, 2].map(() =>
          http(app).post('/v1/auth/refresh').send({ refreshToken: user.refreshToken }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('rejects an unknown refresh token', async () => {
      const res = await http(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'x'.repeat(43) })
        .expect(401);
      expect(res.body.error.code).toBe('TOKEN_INVALID');
    });

    it('logout signs out this device only', async () => {
      const phone = uniquePhone();
      const a = await loginUser(app, sms, phone, 'device-aaaa');
      const b = await loginUser(app, sms, phone, 'device-bbbb');

      await http(app).post('/v1/auth/logout').set(bearer(a.accessToken)).expect(204);
      await http(app).get('/v1/me').set(bearer(a.accessToken)).expect(401);
      const refresh = await http(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: a.refreshToken })
        .expect(401);
      expect(refresh.body.error.code).toBe('TOKEN_INVALID');

      await http(app).get('/v1/me').set(bearer(b.accessToken)).expect(200);
    });

    it('logout-all signs out every device', async () => {
      const phone = uniquePhone();
      const a = await loginUser(app, sms, phone, 'device-aaaa');
      const b = await loginUser(app, sms, phone, 'device-bbbb');
      await http(app).post('/v1/auth/logout-all').set(bearer(a.accessToken)).expect(204);
      await http(app).get('/v1/me').set(bearer(a.accessToken)).expect(401);
      await http(app).get('/v1/me').set(bearer(b.accessToken)).expect(401);
      await http(app).post('/v1/auth/refresh').send({ refreshToken: b.refreshToken }).expect(401);
    });

    it('lists devices and signs out another one', async () => {
      const phone = uniquePhone();
      const a = await loginUser(app, sms, phone, 'device-aaaa');
      const b = await loginUser(app, sms, phone, 'device-bbbb');

      const list = await http(app).get('/v1/me/sessions').set(bearer(a.accessToken)).expect(200);
      expect(list.body).toHaveLength(2);
      const other = list.body.find((s: { current: boolean }) => !s.current);
      expect(other.platform).toBe('android');

      await http(app).delete(`/v1/me/sessions/${other.id}`).set(bearer(a.accessToken)).expect(204);
      await http(app).get('/v1/me').set(bearer(b.accessToken)).expect(401);

      // Can't touch someone else's session.
      const stranger = await loginUser(app, sms);
      await http(app)
        .delete(`/v1/me/sessions/${list.body.find((s: { current: boolean }) => s.current).id}`)
        .set(bearer(stranger.accessToken))
        .expect(404);
    });

    it('rejects malformed and tampered access tokens', async () => {
      const user = await loginUser(app, sms);
      await http(app).get('/v1/me').expect(401);
      await http(app).get('/v1/me').set({ Authorization: 'Basic abc' }).expect(401);
      const [h, p, s] = user.accessToken.split('.');
      const tampered = `${h}.${p}.${s!.slice(0, -2)}xx`;
      const res = await http(app).get('/v1/me').set(bearer(tampered)).expect(401);
      expect(res.body.error.code).toBe('TOKEN_INVALID');
    });
  });

  describe('account status', () => {
    it('a suspended user cannot sign in, refresh or call the API', async () => {
      const user = await loginUser(app, sms);
      await prisma.user.update({ where: { id: user.userId }, data: { status: 'SUSPENDED' } });

      const call = await http(app).get('/v1/me').set(bearer(user.accessToken)).expect(403);
      expect(call.body.error.code).toBe('ACCOUNT_SUSPENDED');

      const refresh = await http(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(403);
      expect(refresh.body.error.code).toBe('ACCOUNT_SUSPENDED');

      const { body } = await requestOtp(user.phone).expect(200);
      const login = await verifyOtp(body.challengeId, sms.lastCodeFor(user.phone)).expect(403);
      expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('updates the name', async () => {
      const user = await loginUser(app, sms);
      const res = await http(app)
        .patch('/v1/me')
        .set(bearer(user.accessToken))
        .send({ name: '  Rahul   Sharma ' })
        .expect(200);
      expect(res.body.user.name).toBe('Rahul Sharma');
    });

    it('deleting the account removes personal data and frees the number', async () => {
      const user = await loginUser(app, sms);
      await http(app).delete('/v1/me').set(bearer(user.accessToken)).expect(202);
      await http(app).get('/v1/me').set(bearer(user.accessToken)).expect(401);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
      expect(row).toMatchObject({ status: 'DELETED', email: null, name: null });
      expect(row.phone).toBe(`deleted:${user.userId}`);
      expect(
        await prisma.auditLog.count({
          where: { action: 'user.account.delete', actorId: user.userId },
        }),
      ).toBe(1);

      const again = await loginUser(app, sms, user.phone);
      expect(again.isNewUser).toBe(true);
      expect(again.userId).not.toBe(user.userId);
    });
  });
});
