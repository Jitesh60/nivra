import type { INestApplication } from '@nestjs/common';
import type { Job } from 'bullmq';
import { BookingWorker } from '../src/modules/bookings/booking-worker.js';
import { DiscoveryQueue } from '../src/modules/discovery/discovery-queue.js';
import { DiscoveryWorker } from '../src/modules/discovery/discovery-worker.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { FakePaymentProvider } from '../src/providers/payments/fake-payment.provider.js';
import { createTestApp } from './create-test-app.js';
import { createAdmin, flushRedis, http, loginAdmin, type UserSession } from './helpers/auth.js';
import type { InMemoryPushProvider } from './helpers/in-memory-push.js';
import type { InMemorySmsProvider } from './helpers/in-memory-sms.js';
import { isoDay, liveListing, verifiedUser } from './helpers/market.js';
import { bearer, paymentHelpers } from './helpers/payments.js';

const PUNE = { lat: 18.5074, lng: 73.8077 };

describe('Growth: saved searches, requests board, referrals (e2e)', () => {
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

  const { pay, devCheckout, ledgerFor } = paymentHelpers(() => ({ app, sms, prisma, fake }));

  const device = async (user: UserSession, token: string) =>
    http(app)
      .put('/v1/me/devices/push-token')
      .set(bearer(user.accessToken))
      .send({ token, platform: 'android' })
      .expect(204);

  /** Runs the discovery jobs waiting on the queue (tests run without the job worker). */
  async function runDiscoveryJobs(): Promise<string[]> {
    const jobs = (await app
      .get(DiscoveryQueue)
      .queue.getJobs(['waiting', 'delayed', 'prioritized'])) as Job[];
    for (const job of jobs) {
      await app.get(DiscoveryWorker).process(job);
      await job.remove();
    }
    return jobs.map((j) => j.id!);
  }

  const notices = (userId: string, type: string) =>
    prisma.notification.findMany({ where: { userId, type }, orderBy: { id: 'asc' } });

  const categoryId = async (slug: string) =>
    (await prisma.category.findFirstOrThrow({ where: { slug } })).id;

  // ── Saved searches ──

  describe('saved searches', () => {
    const save = (user: UserSession, body: object) =>
      http(app).post('/v1/me/saved-searches').set(bearer(user.accessToken)).send(body);

    it('are saved, renamed, run and deleted; a name is suggested; 10 at most', async () => {
      const user = await verifiedUser(app, sms);
      const lender = await verifiedUser(app, sms);
      const listingId = await liveListing(app, lender.userId, { title: 'Canoe with two paddles' });

      const created = (
        await save(user, { filters: { q: 'canoe', ...PUNE, radiusKm: 5 } }).expect(201)
      ).body;
      expect(created).toMatchObject({
        name: '“canoe” within 5 km',
        alertsEnabled: true,
        filters: { q: 'canoe', ...PUNE, radiusKm: 5 },
      });

      const results = (
        await http(app)
          .get(`/v1/me/saved-searches/${created.id}/results`)
          .set(bearer(user.accessToken))
          .expect(200)
      ).body;
      expect(results.items.map((i: { id: string }) => i.id)).toContain(listingId);

      const renamed = (
        await http(app)
          .patch(`/v1/me/saved-searches/${created.id}`)
          .set(bearer(user.accessToken))
          .send({ name: 'Canoes', alertsEnabled: false })
          .expect(200)
      ).body;
      expect(renamed).toMatchObject({ name: 'Canoes', alertsEnabled: false });

      // Someone else can't see or change it.
      await http(app)
        .get(`/v1/me/saved-searches/${created.id}/results`)
        .set(bearer(lender.accessToken))
        .expect(404);
      await save(user, { filters: { ...PUNE, minPricePaise: 500, maxPricePaise: 100 } }).expect(
        400,
      );
      await save(user, { filters: { q: 'x' } }).expect(400); // no area

      for (let i = 0; i < 9; i++)
        await save(user, { filters: { q: `item ${i}`, ...PUNE } }).expect(201);
      const full = await save(user, { filters: { ...PUNE } }).expect(409);
      expect(full.body.error.code).toBe('SAVED_SEARCH_LIMIT');

      await http(app)
        .delete(`/v1/me/saved-searches/${created.id}`)
        .set(bearer(user.accessToken))
        .expect(204);
      const list = (
        await http(app).get('/v1/me/saved-searches').set(bearer(user.accessToken)).expect(200)
      ).body;
      expect(list).toHaveLength(9);
    });

    it('alert once when an approved listing matches; not for others, the lender or an unpause', async () => {
      const fan = await verifiedUser(app, sms, 'Kavya Rao');
      const other = await verifiedUser(app, sms);
      const lender = await verifiedUser(app, sms, 'Asha Patil');
      await device(fan, 'fan-device');
      const trekking = await categoryId('trekking-outdoor');
      await save(fan, {
        filters: { q: 'kayak', ...PUNE, radiusKm: 10, categoryId: trekking },
      }).expect(201);
      await save(other, { filters: { q: 'drone', ...PUNE } }).expect(201);
      await save(lender, { filters: { q: 'kayak', ...PUNE } }).expect(201);

      // A first listing waits for review; an admin approves it.
      const listingId = await liveListing(app, lender.userId, {
        title: 'Inflatable kayak for two',
        status: 'LIVE',
      });
      await prisma.listing.update({ where: { id: listingId }, data: { status: 'PENDING' } });
      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      await http(app)
        .post(`/v1/admin/listings/${listingId}/approve`)
        .set(bearer(ops.accessToken))
        .expect(200);
      // Approving twice can't happen, but queuing twice is a no-op anyway.
      await app.get(DiscoveryQueue).listingLive(listingId);
      expect(await runDiscoveryJobs()).toEqual([`match-${listingId}`]);

      const alerts = await notices(fan.userId, 'search.alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ title: 'New: Inflatable kayak for two' });
      expect(alerts[0]!.data).toEqual({ listingId });
      expect(push.to('fan-device').map((m) => m.data)).toEqual([
        expect.objectContaining({ type: 'search.alert', listingId }),
      ]);
      expect(await notices(other.userId, 'search.alert')).toHaveLength(0);
      expect(await notices(lender.userId, 'search.alert')).toHaveLength(0);

      // In the bell too, with the listing to open.
      const bell = (
        await http(app).get('/v1/me/notifications').set(bearer(fan.accessToken)).expect(200)
      ).body.items;
      expect(bell[0]).toMatchObject({ type: 'search.alert', listingId, bookingId: null });

      // A second match within 6 hours: in the bell, but no second push.
      const second = await liveListing(app, lender.userId, { title: 'Kayak paddle set' });
      await app
        .get(DiscoveryWorker)
        .process({ name: 'match-listing', data: { listingId: second } });
      expect(await notices(fan.userId, 'search.alert')).toHaveLength(2);
      expect(push.to('fan-device')).toHaveLength(1);

      // Pausing and unpausing is not a new listing.
      for (const step of ['pause', 'unpause']) {
        await http(app)
          .post(`/v1/me/listings/${listingId}/${step}`)
          .set(bearer(lender.accessToken))
          .expect(200);
      }
      expect(await runDiscoveryJobs()).toEqual([]);
    });

    it('no alert when alerts are off, the lender is blocked, or pushes are turned off', async () => {
      const fan = await verifiedUser(app, sms);
      const blocked = await verifiedUser(app, sms);
      const lender = await verifiedUser(app, sms);
      await device(fan, 'quiet-device');
      const off = (await save(fan, { filters: { q: 'hammock', ...PUNE } }).expect(201)).body;
      await http(app)
        .patch(`/v1/me/saved-searches/${off.id}`)
        .set(bearer(fan.accessToken))
        .send({ alertsEnabled: false })
        .expect(200);
      await save(blocked, { filters: { q: 'hammock', ...PUNE } }).expect(201);
      await http(app)
        .put(`/v1/me/blocks/${lender.userId}`)
        .set(bearer(blocked.accessToken))
        .expect(204);
      const listingId = await liveListing(app, lender.userId, { title: 'Camping hammock' });
      expect(
        await app.get(DiscoveryWorker).process({ name: 'match-listing', data: { listingId } }),
      ).toBe(0);

      // Alerts on, pushes off: the bell only.
      await http(app)
        .patch(`/v1/me/saved-searches/${off.id}`)
        .set(bearer(fan.accessToken))
        .send({ alertsEnabled: true })
        .expect(200);
      await http(app)
        .put('/v1/me/notification-preferences')
        .set(bearer(fan.accessToken))
        .send({ pushSearchAlerts: false })
        .expect(200);
      expect(
        await app.get(DiscoveryWorker).process({ name: 'match-listing', data: { listingId } }),
      ).toBe(1);
      expect(push.to('quiet-device')).toHaveLength(0);
    });
  });

  // ── Requests board ──

  describe('requests board', () => {
    const post = (user: UserSession, body: object = {}) =>
      http(app)
        .post('/v1/requests')
        .set(bearer(user.accessToken))
        .send({
          title: '2-person tent for Rajmachi',
          details: 'Need it Friday evening to Sunday.',
          startDate: isoDay(5),
          endDate: isoDay(7),
          budgetPerDayPaise: 20_000,
          ...PUNE,
          areaLabel: 'Kothrud, Pune',
          ...body,
        });

    it('a borrower asks, a lender nearby is told and offers a listing, which opens the chat', async () => {
      const borrower = await verifiedUser(app, sms, 'Rahul Sharma');
      const lender = await verifiedUser(app, sms, 'Asha Patil');
      const far = await verifiedUser(app, sms);
      await device(lender, 'lender-requests');
      const listingId = await liveListing(app, lender.userId, { title: 'Quechua 2-person tent' });
      const farListing = await liveListing(app, far.userId, { title: 'Far tent' });
      await prisma.listing.update({
        where: { id: farListing },
        data: { lat: 19.076, lng: 72.8777 },
      }); // Mumbai

      const created = (
        await post(borrower, { categoryId: await categoryId('trekking-outdoor') }).expect(201)
      ).body;
      expect(created).toMatchObject({
        status: 'OPEN',
        mine: true,
        responseCount: 0,
        areaLabel: 'Kothrud, Pune',
        startDate: isoDay(5),
        endDate: isoDay(7),
        distanceKm: null,
      });
      expect(new Date(created.expiresAt).toISOString().slice(0, 10)).toBe(isoDay(8));

      expect(await runDiscoveryJobs()).toEqual([`notify-${created.id}`]);
      const told = await notices(lender.userId, 'request.nearby');
      expect(told).toHaveLength(1);
      expect(told[0]!.data).toEqual({ requestId: created.id });
      expect(push.to('lender-requests').map((m) => m.data.type)).toEqual(['request.nearby']);
      expect(await notices(far.userId, 'request.nearby')).toHaveLength(0);

      // On the lender's board, rounded; never on the borrower's own.
      const board = (
        await http(app)
          .get('/v1/requests')
          .query({ ...PUNE, radiusKm: 5 })
          .set(bearer(lender.accessToken))
          .expect(200)
      ).body.items;
      expect(board.map((r: { id: string }) => r.id)).toContain(created.id);
      expect(board.find((r: { id: string }) => r.id === created.id)).toMatchObject({
        distanceKm: 0.5,
        mine: false,
        answeredByMe: false,
        borrower: { name: 'Rahul Sharma' },
      });
      const own = (
        await http(app)
          .get('/v1/requests')
          .query(PUNE)
          .set(bearer(borrower.accessToken))
          .expect(200)
      ).body.items;
      expect(own.map((r: { id: string }) => r.id)).not.toContain(created.id);

      // The lender offers their tent; the phone number in the message is masked.
      const answered = (
        await http(app)
          .post(`/v1/requests/${created.id}/responses`)
          .set(bearer(lender.accessToken))
          .send({ listingId, message: 'I have one! Call me on 98765 43210.' })
          .expect(201)
      ).body;
      expect(answered).toMatchObject({ answeredByMe: true, responseCount: 1 });
      expect(answered.responses).toHaveLength(1);
      const conversationId = answered.responses[0].conversationId;
      expect(answered.responses[0].message).not.toContain('98765');

      const again = await http(app)
        .post(`/v1/requests/${created.id}/responses`)
        .set(bearer(lender.accessToken))
        .send({ listingId, message: 'Still free!' })
        .expect(409);
      expect(again.body.error.code).toBe('REQUEST_ALREADY_ANSWERED');
      await http(app)
        .post(`/v1/requests/${created.id}/responses`)
        .set(bearer(far.accessToken))
        .send({ listingId, message: 'Not mine' })
        .expect(404);

      // The borrower is told, and the chat is in both inboxes.
      const response = await notices(borrower.userId, 'request.response');
      expect(response).toHaveLength(1);
      expect(response[0]!.title).toBe('Asha can help: Quechua 2-person tent');
      const inbox = (
        await http(app).get('/v1/conversations').set(bearer(borrower.accessToken)).expect(200)
      ).body.items;
      expect(inbox.map((c: { id: string }) => c.id)).toContain(conversationId);
      const messages = (
        await http(app)
          .get(`/v1/conversations/${conversationId}/messages`)
          .set(bearer(borrower.accessToken))
          .expect(200)
      ).body.items;
      expect(messages.at(-1).body).not.toContain('98765');

      // The borrower sees every answer, with the listing card.
      const mine = (
        await http(app).get('/v1/me/requests').set(bearer(borrower.accessToken)).expect(200)
      ).body;
      expect(mine[0].responses[0]).toMatchObject({
        conversationId,
        listing: { id: listingId },
        lender: { name: 'Asha Patil' },
      });

      // Closed: off the board, and no more answers.
      await http(app)
        .post(`/v1/requests/${created.id}/close`)
        .set(bearer(borrower.accessToken))
        .expect(200);
      await http(app).get(`/v1/requests/${created.id}`).set(bearer(lender.accessToken)).expect(404);
      const closed = await http(app)
        .post(`/v1/requests/${created.id}/responses`)
        .set(bearer(lender.accessToken))
        .send({ listingId, message: 'Hello?' })
        .expect(409);
      expect(closed.body.error.code).toBe('REQUEST_NOT_OPEN');
    });

    it('checks dates and limits, expires on time, can be reported and removed', async () => {
      const borrower = await verifiedUser(app, sms);
      const neighbour = await verifiedUser(app, sms);
      await post(borrower, { startDate: isoDay(5), endDate: isoDay(3) }).expect(400);
      await post(borrower, { startDate: isoDay(-1), endDate: isoDay(1) }).expect(400);
      await post(borrower, { endDate: undefined }).expect(400);
      const ids: string[] = [];
      for (let i = 0; i < 5; i++)
        ids.push((await post(borrower, { title: `Thing ${i}` }).expect(201)).body.id);
      expect((await post(borrower).expect(409)).body.error.code).toBe('REQUEST_LIMIT');

      // Reported by a neighbour, then removed by Ops (Support can only look).
      await http(app)
        .post('/v1/reports')
        .set(bearer(neighbour.accessToken))
        .send({ targetType: 'REQUEST', targetId: ids[0], reason: 'SPAM' })
        .expect(201);
      await http(app)
        .post('/v1/reports')
        .set(bearer(borrower.accessToken))
        .send({ targetType: 'REQUEST', targetId: ids[0], reason: 'SPAM' })
        .expect(400);
      const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      const seen = (
        await http(app)
          .get(`/v1/admin/requests/${ids[0]}`)
          .set(bearer(support.accessToken))
          .expect(200)
      ).body;
      expect(seen).toMatchObject({ openReports: 1, status: 'OPEN' });
      const reports = (
        await http(app).get('/v1/admin/reports').set(bearer(support.accessToken)).expect(200)
      ).body.items;
      expect(
        reports.find((r: { target: { id: string } }) => r.target.id === ids[0]).target,
      ).toMatchObject({
        type: 'REQUEST',
        label: 'Thing 0',
        ownerId: borrower.userId,
      });
      await http(app)
        .post(`/v1/admin/requests/${ids[0]}/remove`)
        .set(bearer(support.accessToken))
        .send({ reason: 'Not allowed' })
        .expect(403);
      const removed = (
        await http(app)
          .post(`/v1/admin/requests/${ids[0]}/remove`)
          .set(bearer(ops.accessToken))
          .send({ reason: 'Asks for something not allowed on Nivra' })
          .expect(200)
      ).body;
      expect(removed).toMatchObject({
        status: 'REMOVED',
        removedReason: 'Asks for something not allowed on Nivra',
      });
      expect(await notices(borrower.userId, 'request.removed')).toHaveLength(1);
      expect(
        await prisma.auditLog.count({
          where: { action: 'admin.request.remove', targetId: ids[0] },
        }),
      ).toBe(1);
      const list = (
        await http(app)
          .get('/v1/admin/requests')
          .query({ status: 'REMOVED' })
          .set(bearer(support.accessToken))
          .expect(200)
      ).body.items;
      expect(list.map((r: { id: string }) => r.id)).toContain(ids[0]);

      // Past its expiry: the hourly job closes it.
      await prisma.itemRequest.update({
        where: { id: ids[1] },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(
        await app.get(DiscoveryWorker).process({ name: 'expire-requests', data: {} }),
      ).toBeGreaterThanOrEqual(1);
      expect((await prisma.itemRequest.findUniqueOrThrow({ where: { id: ids[1] } })).status).toBe(
        'EXPIRED',
      );
    });
  });

  // ── Referrals and credit ──

  describe('referrals and credit', () => {
    const referral = async (user: UserSession) =>
      (await http(app).get('/v1/me/referral').set(bearer(user.accessToken)).expect(200)).body;
    const redeem = (user: UserSession, code: string) =>
      http(app).post('/v1/me/referral/redeem').set(bearer(user.accessToken)).send({ code });

    /** A new person who joined with [inviter]'s code. */
    async function invited(inviter: UserSession, name = 'Rahul Sharma') {
      const user = await verifiedUser(app, sms, name);
      const { code } = await referral(inviter);
      await redeem(user, code.toLowerCase().replace(/(....)/, '$1 ')).expect(200);
      return user;
    }

    /** ₹150/day × 2 days + ₹1,000 deposit, requested by [borrower] and accepted. */
    async function accepted(borrower: UserSession, from = 10) {
      const lender = await verifiedUser(app, sms, 'Asha Patil');
      const listingId = await liveListing(app, lender.userId, { title: `Credit tent ${from}` });
      const booking = (
        await http(app)
          .post('/v1/bookings')
          .set(bearer(borrower.accessToken))
          .send({ listingId, startDate: isoDay(from), endDate: isoDay(from + 1) })
          .expect(201)
      ).body;
      await http(app)
        .post(`/v1/bookings/${booking.id}/accept`)
        .set(bearer(lender.accessToken))
        .expect(200);
      return { lender, listingId, bookingId: booking.id as string, booking };
    }

    it('gives a stable code; a new person gets ₹100 once; rules are enforced', async () => {
      const inviter = await verifiedUser(app, sms, 'Meera Iyer');
      const first = await referral(inviter);
      expect(first.code).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
      expect(first.link).toBe(`https://sajha.app/r/${first.code}`);
      expect(first).toMatchObject({ invited: 0, creditBalancePaise: 0, canRedeem: true });
      expect((await referral(inviter)).code).toBe(first.code);

      const friend = await invited(inviter);
      const mine = await referral(friend);
      expect(mine).toMatchObject({
        creditBalancePaise: 10_000,
        canRedeem: false,
        referredBy: { name: 'Meera Iyer' },
      });
      expect(mine.entries).toEqual([
        expect.objectContaining({ kind: 'GRANT_REFEREE', amountPaise: 10_000 }),
      ]);
      expect((await referral(inviter)).invited).toBe(1);
      expect(await notices(inviter.userId, 'referral.joined')).toHaveLength(1);

      expect((await redeem(friend, first.code).expect(409)).body.error.code).toBe(
        'REFERRAL_NOT_ALLOWED',
      );
      const self = await verifiedUser(app, sms);
      const own = (await referral(self)).code;
      expect((await redeem(self, own).expect(400)).body.error.code).toBe('REFERRAL_CODE_INVALID');
      await redeem(self, 'ZZZZZZZZ').expect(400);
      await redeem(self, 'no!').expect(400);

      // Too late: more than 7 days after joining.
      const late = await verifiedUser(app, sms);
      await prisma.user.update({
        where: { id: late.userId },
        data: { createdAt: new Date(Date.now() - 8 * 86_400_000) },
      });
      await redeem(late, first.code).expect(409);
    });

    it('comes off the rent when booking, and goes back if the booking is declined', async () => {
      const inviter = await verifiedUser(app, sms);
      const borrower = await invited(inviter);
      const lender = await verifiedUser(app, sms);
      const listingId = await liveListing(app, lender.userId, { title: 'Credit stove' });

      const quote = (
        await http(app)
          .get(`/v1/listings/${listingId}/quote`)
          .query({ startDate: isoDay(10), endDate: isoDay(11) })
          .set(bearer(borrower.accessToken))
          .expect(200)
      ).body;
      expect(quote).toMatchObject({ rentPaise: 30_000, creditPaise: 10_000, totalPaise: 120_000 });
      const anonymous = (
        await http(app)
          .get(`/v1/listings/${listingId}/quote`)
          .query({ startDate: isoDay(10), endDate: isoDay(11) })
          .expect(200)
      ).body;
      expect(anonymous).toMatchObject({ creditPaise: 0, totalPaise: 130_000 });

      const booking = (
        await http(app)
          .post('/v1/bookings')
          .set(bearer(borrower.accessToken))
          .send({ listingId, startDate: isoDay(10), endDate: isoDay(11) })
          .expect(201)
      ).body;
      expect(booking).toMatchObject({
        rentPaise: 30_000,
        creditPaise: 10_000,
        totalPaise: 120_000,
      });
      expect((await referral(borrower)).creditBalancePaise).toBe(0);

      await http(app)
        .post(`/v1/bookings/${booking.id}/decline`)
        .set(bearer(lender.accessToken))
        .send({})
        .expect(200);
      const after = await referral(borrower);
      expect(after.creditBalancePaise).toBe(10_000);
      expect(after.entries.map((e: { kind: string }) => e.kind)).toEqual([
        'RELEASE',
        'HOLD',
        'GRANT_REFEREE',
      ]);
    });

    it('is capped at half the rent', async () => {
      const inviter = await verifiedUser(app, sms);
      const borrower = await invited(inviter);
      const lender = await verifiedUser(app, sms);
      const listingId = await liveListing(app, lender.userId, {
        title: 'Cheap lamp',
        pricePerDayPaise: 5_000,
      });
      const booking = (
        await http(app)
          .post('/v1/bookings')
          .set(bearer(borrower.accessToken))
          .send({ listingId, startDate: isoDay(10), endDate: isoDay(10) })
          .expect(201)
      ).body;
      expect(booking).toMatchObject({ rentPaise: 5_000, creditPaise: 2_500 });
      expect((await referral(borrower)).creditBalancePaise).toBe(7_500);
    });

    it('paid with credit: the card pays less, the ledger balances, a cancellation gives it back', async () => {
      const inviter = await verifiedUser(app, sms);
      const borrower = await invited(inviter);
      const m = await accepted(borrower, 10);
      const order = (await pay(borrower, m.bookingId).expect(200)).body;
      expect(order.amountPaise).toBe(120_000);
      await devCheckout(borrower, order.orderId, 'success', 'now');

      const { net } = await ledgerFor(m.bookingId);
      expect(net).toMatchObject({
        GATEWAY: -120_000,
        PROMOTIONS: -10_000,
        DEPOSIT_HELD: 100_000,
        LENDER_PAYABLE: 27_000,
        PLATFORM_REVENUE: 3_000,
      });

      // More than 48 hours ahead: everything back; the credit part as credit.
      const preview = (
        await http(app)
          .get(`/v1/bookings/${m.bookingId}/cancel-preview`)
          .set(bearer(borrower.accessToken))
          .expect(200)
      ).body;
      expect(preview).toMatchObject({ refundPaise: 120_000, creditBackPaise: 10_000 });
      await http(app)
        .post(`/v1/bookings/${m.bookingId}/cancel`)
        .set(bearer(borrower.accessToken))
        .send({ reason: 'Plans changed' })
        .expect(200);
      const refund = await prisma.refund.findFirstOrThrow({ where: { bookingId: m.bookingId } });
      expect(refund.amountPaise).toBe(120_000);
      expect((await referral(borrower)).creditBalancePaise).toBe(10_000);
      const after = (await ledgerFor(m.bookingId)).net;
      expect(after.GATEWAY).toBe(0);
      expect(after.PROMOTIONS).toBe(0);
      expect(after.LENDER_PAYABLE).toBe(0);

      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      const summary = (
        await http(app).get('/v1/admin/ledger/summary').set(bearer(ops.accessToken)).expect(200)
      ).body;
      expect(summary.balanced).toBe(true);
    });

    it('rewards the inviter once, when the first rental completes', async () => {
      const inviter = await verifiedUser(app, sms, 'Meera Iyer');
      await device(inviter, 'inviter-device');
      const borrower = await invited(inviter);

      async function complete(from: number) {
        const m = await accepted(borrower, from);
        const order = (await pay(borrower, m.bookingId).expect(200)).body;
        await devCheckout(borrower, order.orderId, 'success', 'now');
        // Handed over and returned; then the claim window runs out.
        await prisma.booking.update({
          where: { id: m.bookingId },
          data: {
            status: 'RETURNED',
            handedOverAt: new Date(),
            returnedAt: new Date(),
            expiresAt: new Date(Date.now() - 1000),
          },
        });
        await app.get(BookingWorker).process({ name: 'expire', data: { bookingId: m.bookingId } });
        expect(
          (await prisma.booking.findUniqueOrThrow({ where: { id: m.bookingId } })).status,
        ).toBe('COMPLETED');
      }

      await complete(10);
      let mine = await referral(inviter);
      expect(mine).toMatchObject({ invited: 1, rewarded: 1, creditBalancePaise: 10_000 });
      expect(push.to('inviter-device').map((m) => m.data.type)).toEqual(['referral.rewarded']);

      await complete(20);
      mine = await referral(inviter);
      expect(mine).toMatchObject({ rewarded: 1, creditBalancePaise: 10_000 });
    });

    it('admins see referrals and can take unused credit away', async () => {
      const inviter = await verifiedUser(app, sms, 'Meera Iyer');
      const friend = await invited(inviter, 'Kiran Joshi');
      const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));

      const view = (
        await http(app)
          .get(`/v1/admin/users/${inviter.userId}/referral`)
          .set(bearer(support.accessToken))
          .expect(200)
      ).body;
      expect(view.invited).toEqual([
        expect.objectContaining({
          user: expect.objectContaining({ name: 'Kiran Joshi' }),
          rewardedAt: null,
        }),
      ]);
      const friendView = (
        await http(app)
          .get(`/v1/admin/users/${friend.userId}/referral`)
          .set(bearer(support.accessToken))
          .expect(200)
      ).body;
      expect(friendView).toMatchObject({
        referredBy: { name: 'Meera Iyer' },
        creditBalancePaise: 10_000,
      });

      const revoke = (user: string, amountPaise: number, token: string) =>
        http(app)
          .post(`/v1/admin/users/${user}/credits/revoke`)
          .set(bearer(token))
          .send({ amountPaise, reason: 'Code posted on a coupon site' });
      await revoke(friend.userId, 4_000, support.accessToken).expect(403);
      expect(
        (await revoke(friend.userId, 20_000, ops.accessToken).expect(400)).body.error.code,
      ).toBe('CREDIT_TOO_LARGE');
      const after = (await revoke(friend.userId, 4_000, ops.accessToken).expect(200)).body;
      expect(after.creditBalancePaise).toBe(6_000);
      expect(after.entries[0]).toMatchObject({
        kind: 'REVOKE',
        amountPaise: -4_000,
        reason: 'Code posted on a coupon site',
      });
      expect(
        await prisma.auditLog.count({
          where: { action: 'admin.credit.revoke', targetId: friend.userId },
        }),
      ).toBe(1);

      // A new person can't redeem after booking.
      const booker = await verifiedUser(app, sms);
      await accepted(booker, 30);
      await redeem(booker, (await referral(inviter)).code).expect(409);
    });
  });
});
