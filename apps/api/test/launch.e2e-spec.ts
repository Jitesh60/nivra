import type { INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { FakePaymentProvider } from '../src/providers/payments/fake-payment.provider.js';
import { REDIS } from '../src/redis/redis.token.js';
import { createTestApp } from './create-test-app.js';
import { createAdmin, flushRedis, http, loginAdmin } from './helpers/auth.js';
import { emailsTo, sendQueuedEmails } from './helpers/email.js';
import type { InMemoryPushProvider } from './helpers/in-memory-push.js';
import type { InMemorySmsProvider } from './helpers/in-memory-sms.js';
import { isoDay, liveListing, verifiedUser } from './helpers/market.js';
import { bearer, paymentHelpers } from './helpers/payments.js';

describe('Launch: preferences, emails, analytics, limits (e2e)', () => {
  let app: INestApplication;
  let sms: InMemorySmsProvider;
  let push: InMemoryPushProvider;
  let fake: FakePaymentProvider;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, sms, push, payments: fake } = await createTestApp());
    prisma = app.get(PrismaService);
  });

  beforeEach(() => flushRedis(app));

  afterAll(async () => {
    await app.close();
  });

  const { paid } = paymentHelpers(() => ({ app, sms, prisma, fake }));
  const emailOf = async (userId: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email!;
  const prefs = (token: string, body?: object) =>
    body
      ? http(app).put('/v1/me/notification-preferences').set(bearer(token)).send(body)
      : http(app).get('/v1/me/notification-preferences').set(bearer(token));

  describe('notification preferences', () => {
    it('start at the defaults and change one switch at a time', async () => {
      const user = await verifiedUser(app, sms);
      expect((await prefs(user.accessToken).expect(200)).body).toEqual({
        pushBookings: true,
        pushChat: true,
        pushReminders: true,
        emailBookings: true,
        smsReminders: true,
        marketing: false,
        pushSearchAlerts: true,
        pushRequests: true,
      });
      const changed = (await prefs(user.accessToken, { pushChat: false }).expect(200)).body;
      expect(changed).toMatchObject({ pushChat: false, pushBookings: true });
      const again = (await prefs(user.accessToken, { marketing: true }).expect(200)).body;
      expect(again).toMatchObject({ pushChat: false, marketing: true });
      await prefs(user.accessToken, { pushChat: 'no' }).expect(400);
      await prefs(user.accessToken, { unknown: true }).expect(400);
      await http(app).get('/v1/me/notification-preferences').expect(401);
    });

    it('booking pushes stop when turned off; the in-app notice still arrives', async () => {
      const lender = await verifiedUser(app, sms, 'Asha Patil');
      await http(app)
        .put('/v1/me/devices/push-token')
        .set(bearer(lender.accessToken))
        .send({ token: 'lender-device-token-1', platform: 'android' })
        .expect(204);
      const listingId = await liveListing(app, lender.userId, { title: 'Pref tent' });
      const request = async (from: number) => {
        const borrower = await verifiedUser(app, sms);
        await http(app)
          .post('/v1/bookings')
          .set(bearer(borrower.accessToken))
          .send({ listingId, startDate: isoDay(from), endDate: isoDay(from) })
          .expect(201);
      };

      await request(10);
      expect(push.to('lender-device-token-1').map((m) => m.data.type)).toEqual([
        'booking.requested',
      ]);

      await prefs(lender.accessToken, { pushBookings: false }).expect(200);
      await request(12);
      expect(push.to('lender-device-token-1')).toHaveLength(1);
      expect(
        await prisma.notification.count({
          where: { userId: lender.userId, type: 'booking.requested' },
        }),
      ).toBe(2);
    });
  });

  describe('emails', () => {
    it('a paid booking sends the borrower a receipt and tells the lender', async () => {
      const m = await paid(10);
      expect(await sendQueuedEmails(app)).toBe(2);

      const [receipt] = await emailsTo(await emailOf(m.borrower.userId));
      expect(receipt?.subject).toMatch(/^Booked: Tent \d+, /);
      expect(receipt?.text).toContain('₹150 × 2 days: ₹300');
      expect(receipt?.text).toContain('Refundable deposit: ₹1,000');
      expect(receipt?.text).toMatch(/Total paid \(receipt #[0-9A-F]{6}\): ₹1,3\d\d/);
      const [lender] = await emailsTo(await emailOf(m.lender.userId));
      expect(lender?.subject).toMatch(/^Confirmed: Tent \d+, /);
      expect(lender?.text).toContain('You’ll earn ₹270');

      // Queued once: a second run sends nothing.
      expect(await sendQueuedEmails(app)).toBe(0);
    });

    it('a refund is emailed unless booking emails are off', async () => {
      const m = await paid(10);
      await sendQueuedEmails(app);
      await http(app)
        .post(`/v1/bookings/${m.bookingId}/cancel`)
        .set(bearer(m.borrower.accessToken))
        .send({ reason: 'Plans changed' })
        .expect(200);
      await sendQueuedEmails(app);
      const refund = (await emailsTo(await emailOf(m.borrower.userId))).find((e) =>
        e.subject.startsWith('Refund of'),
      );
      expect(refund?.text).toContain('usually shows up in 5–7 working days');

      const quiet = await paid(20);
      await prefs(quiet.borrower.accessToken, { emailBookings: false }).expect(200);
      await sendQueuedEmails(app);
      await http(app)
        .post(`/v1/bookings/${quiet.bookingId}/cancel`)
        .set(bearer(quiet.borrower.accessToken))
        .send({ reason: 'Plans changed' })
        .expect(200);
      await sendQueuedEmails(app);
      // The receipt went before they turned emails off; the refund email didn't.
      const subjects = (await emailsTo(await emailOf(quiet.borrower.userId))).map((e) => e.subject);
      expect(subjects).toEqual([expect.stringMatching(/^Booked: /)]);
    });

    it('deleting an account is confirmed by email, whatever the preferences', async () => {
      const user = await verifiedUser(app, sms, 'Meera Iyer');
      const email = await emailOf(user.userId);
      await prefs(user.accessToken, { emailBookings: false }).expect(200);
      await http(app).delete('/v1/me').set(bearer(user.accessToken)).expect(202);
      await sendQueuedEmails(app);
      const [deleted] = await emailsTo(email);
      expect(deleted?.subject).toBe('Your Nivra account has been deleted');
      expect(deleted?.text).toContain('Hi Meera');
      expect(await prisma.notificationPreferences.count({ where: { userId: user.userId } })).toBe(
        0,
      );
    });
  });

  describe('admin analytics', () => {
    it('counts a paid booking in today’s numbers, for any admin role', async () => {
      const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
      const get = async (days: number) =>
        (
          await http(app)
            .get(`/v1/admin/analytics?days=${days}`)
            .set(bearer(support.accessToken))
            .expect(200)
        ).body;

      const before = await get(7);
      expect(before.series).toHaveLength(7);
      expect(before.series.at(-1).date).toBe(before.to);

      const m = await paid(10);
      // Cached for 5 minutes; a fresh cache sees the booking.
      expect((await get(7)).totals).toEqual(before.totals);
      await app.get<Redis>(REDIS).del(`analytics:7:${before.to}`);
      const after = await get(7);
      const total = (await prisma.booking.findUniqueOrThrow({ where: { id: m.bookingId } }))
        .totalPaise;
      expect(after.totals.requested - before.totals.requested).toBe(1);
      expect(after.totals.confirmed - before.totals.confirmed).toBe(1);
      expect(after.totals.gmvPaise - before.totals.gmvPaise).toBe(total);
      expect(after.totals.revenuePaise - before.totals.revenuePaise).toBeGreaterThan(0);
      expect(after.totals.signups - before.totals.signups).toBe(2);
      expect(after.series.at(-1).confirmed - before.series.at(-1).confirmed).toBe(1);
      expect(after.now.users).toBeGreaterThanOrEqual(2);
      expect(after.funnel.confirmed).toBeGreaterThanOrEqual(1);
      expect(after.funnel.requested).toBeGreaterThanOrEqual(after.funnel.confirmed);

      expect((await get(90)).series).toHaveLength(90);
      await http(app)
        .get('/v1/admin/analytics?days=5')
        .set(bearer(support.accessToken))
        .expect(400);
      await http(app).get('/v1/admin/analytics').expect(401);
    });
  });

  describe('admin system status', () => {
    it('shows queue depth and dependency latency to any admin, nobody else', async () => {
      const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
      const body = (
        await http(app).get('/v1/admin/system').set(bearer(support.accessToken)).expect(200)
      ).body;
      expect(body.version).toBe(process.env.GIT_SHA || 'dev');
      expect(body.database).toMatchObject({ status: 'up' });
      expect(body.database.latencyMs).toBeGreaterThanOrEqual(0);
      expect(body.redis).toMatchObject({ status: 'up' });
      expect(body.queues.map((q: { name: string }) => q.name)).toEqual([
        'bookings',
        'email',
        'payments',
        'rentals',
        'discovery',
      ]);
      for (const q of body.queues) {
        expect(q).toEqual({
          name: q.name,
          waiting: expect.any(Number),
          active: expect.any(Number),
          delayed: expect.any(Number),
          failed: expect.any(Number),
          workers: q.workers === null ? null : expect.any(Number),
        });
      }

      // A queued email shows up as waiting until the worker sends it.
      const user = await verifiedUser(app, sms);
      await http(app).delete('/v1/me').set(bearer(user.accessToken)).expect(202);
      const email = (
        await http(app).get('/v1/admin/system').set(bearer(support.accessToken)).expect(200)
      ).body.queues.find((q: { name: string }) => q.name === 'email');
      expect(email.waiting + email.active + email.delayed).toBeGreaterThanOrEqual(1);
      await sendQueuedEmails(app);

      await http(app).get('/v1/admin/system').expect(401);
      await http(app).get('/v1/admin/system').set(bearer(user.accessToken)).expect(401);
    });
  });

  describe('hardening', () => {
    it('limits public reads per IP with a Retry-After', async () => {
      await app.get<Redis>(REDIS).set('read:203.0.113.9', 100_000, 'EX', 60);
      const limited = await http(app)
        .get('/v1/home')
        .set('X-Forwarded-For', '203.0.113.9')
        .expect(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      await http(app).get('/v1/search').set('X-Forwarded-For', '203.0.113.9').expect(429);
      // Someone else is fine.
      await http(app).get('/v1/home').set('X-Forwarded-For', '203.0.113.10').expect(200);
    });

    it('health reports the deployed version', async () => {
      const res = await http(app).get('/v1/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', version: expect.any(String) });
    });
  });
});
