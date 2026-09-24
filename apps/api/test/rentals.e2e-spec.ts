import type { INestApplication } from '@nestjs/common';
import { BookingWorker } from '../src/modules/bookings/booking-worker.js';
import { lateDaysFor } from '../src/modules/bookings/booking-rules.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { istToday } from '../src/modules/rentals/reminders.service.js';
import { RentalsWorker } from '../src/modules/rentals/rentals-worker.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { FakePaymentProvider } from '../src/providers/payments/fake-payment.provider.js';
import { createTestApp } from './create-test-app.js';
import { createAdmin, flushRedis, http, loginAdmin, type UserSession } from './helpers/auth.js';
import { emailsTo, sendQueuedEmails } from './helpers/email.js';
import type { InMemorySmsProvider } from './helpers/in-memory-sms.js';
import { bearer, paymentHelpers } from './helpers/payments.js';
import { photo, upload } from './helpers/uploads.js';

const DAY = 86_400_000;

describe('Rentals: handover, return, disputes, reviews (e2e)', () => {
  let app: INestApplication;
  let sms: InMemorySmsProvider;
  let fake: FakePaymentProvider;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, sms, payments: fake } = await createTestApp());
    prisma = app.get(PrismaService);
  });

  beforeEach(() => flushRedis(app));

  afterAll(async () => {
    await app.close();
  });

  const { paid, detail, ledgerFor, startIn } = paymentHelpers(() => ({ app, sms, prisma, fake }));

  // ── Steps ──

  const photos = async (user: UserSession, n: number) =>
    Promise.all(
      Array.from({ length: n }, async (_, i) =>
        upload(app, user.accessToken, 'CONDITION_PHOTO', await photo(800, 600, `#1${i}A482`)),
      ),
    );

  const post = (user: UserSession, path: string, body: object = {}) =>
    http(app).post(`/v1/bookings/${path}`).set(bearer(user.accessToken)).send(body);

  const codeOf = async (user: UserSession, id: string) =>
    (await http(app).get(`/v1/bookings/${id}/code`).set(bearer(user.accessToken)).expect(200))
      .body as { stage: string; code: string; qr: string };

  /** Moves the booking's dates (whole days from today in India), keeping its length. */
  async function datesFrom(bookingId: string, startOffset: number) {
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    const start = new Date(istToday(new Date()).getTime() + startOffset * DAY);
    await prisma.booking.update({
      where: { id: bookingId },
      data: { startsOn: start, endsOn: new Date(start.getTime() + (b.days - 1) * DAY) },
    });
  }

  /** Paid, then handed over today (the lender has an active payout account). */
  async function handedOver() {
    const m = await paid(10, { payoutAccount: true });
    await datesFrom(m.bookingId, 0);
    const { code } = await codeOf(m.borrower, m.bookingId);
    await post(m.lender, `${m.bookingId}/handover`, {
      code,
      photoKeys: await photos(m.lender, 2),
    }).expect(200);
    return m;
  }

  async function returned(m: Awaited<ReturnType<typeof handedOver>>) {
    const { code } = await codeOf(m.lender, m.bookingId);
    return (
      await post(m.borrower, `${m.bookingId}/return`, {
        code,
        photoKeys: await photos(m.borrower, 2),
      }).expect(200)
    ).body;
  }

  /** The claim window runs out (the booking's timer fires). */
  async function claimWindowEnds(bookingId: string) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await app.get(BookingWorker).process({ name: 'expire', data: { bookingId } });
  }

  async function completed() {
    const m = await handedOver();
    await returned(m);
    await claimWindowEnds(m.bookingId);
    return m;
  }

  // ── Handover ──

  describe('handover', () => {
    it('the borrower shows a code; the lender confirms with it and photos', async () => {
      const m = await paid(10, { payoutAccount: true });
      // The lender has no code to show yet; the borrower has the handover code.
      const none = await http(app)
        .get(`/v1/bookings/${m.bookingId}/code`)
        .set(bearer(m.lender.accessToken))
        .expect(409);
      expect(none.body.error.code).toBe('BOOKING_INVALID_TRANSITION');
      const shown = await codeOf(m.borrower, m.bookingId);
      expect(shown).toMatchObject({ stage: 'HANDOVER', code: expect.stringMatching(/^\d{6}$/) });
      expect(shown.qr).toBe(`sajha://booking/${m.bookingId}/HANDOVER/${shown.code}`);
      expect((await detail(m.borrower, m.bookingId)).can).toMatchObject({ showCode: true });

      // Ten days before the start: too early.
      const early = await post(m.lender, `${m.bookingId}/handover`, {
        code: shown.code,
        photoKeys: ['a', 'b'],
      }).expect(400);
      expect(early.body.error.code).toBe('HANDOVER_TOO_EARLY');

      await startIn(m.bookingId, 0);
      expect((await detail(m.lender, m.bookingId)).can).toMatchObject({
        handover: true,
        noShow: false,
      });
      const wrong = await post(m.lender, `${m.bookingId}/handover`, {
        code: shown.code === '000000' ? '111111' : '000000',
        photoKeys: ['a', 'b'],
      }).expect(400);
      expect(wrong.body.error).toMatchObject({
        code: 'BOOKING_CODE_INVALID',
        details: { triesLeft: 4 },
      });
      const onePhoto = await post(m.lender, `${m.bookingId}/handover`, {
        code: shown.code,
        photoKeys: await photos(m.lender, 1),
      }).expect(400);
      expect(onePhoto.body.error.code).toBe('PHOTOS_REQUIRED');
      // Only the lender confirms the handover.
      await post(m.borrower, `${m.bookingId}/handover`, {
        code: shown.code,
        photoKeys: ['a', 'b'],
      }).expect(409);

      const done = (
        await post(m.lender, `${m.bookingId}/handover`, {
          code: shown.code,
          photoKeys: await photos(m.lender, 2),
          note: 'Tent, poles and pegs. Small scuff on the bag.',
        }).expect(200)
      ).body;
      expect(done.status).toBe('ACTIVE');
      expect(done.rental).toMatchObject({ handedOverAt: expect.any(String), lateDays: 0 });
      expect(done.conditionReports).toEqual([
        expect.objectContaining({ stage: 'HANDOVER', by: 'LENDER', note: expect.any(String) }),
      ]);
      expect(done.conditionReports[0].photos).toHaveLength(2);
      // The photos are private, re-encoded WebP behind short links.
      const image = await fetch(done.conditionReports[0].photos[0].url);
      expect(image.status).toBe(200);
      expect(image.headers.get('content-type')).toBe('image/webp');
      expect(done.events.at(-1)).toMatchObject({ type: 'HANDED_OVER', by: 'LENDER' });

      // The borrower adds their own handover photos, and can return it now.
      const mine = (
        await post(m.borrower, `${m.bookingId}/photos`, {
          stage: 'HANDOVER',
          photoKeys: await photos(m.borrower, 1),
        }).expect(200)
      ).body;
      expect(mine.conditionReports.map((r: { by: string }) => r.by)).toEqual([
        'LENDER',
        'BORROWER',
      ]);
      expect(mine.can).toMatchObject({ return: true, cancel: false, showCode: false });
      // The lender now shows the return code.
      expect((await codeOf(m.lender, m.bookingId)).stage).toBe('RETURN');
      // Nobody cancels once it has changed hands.
      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      await http(app)
        .post(`/v1/admin/bookings/${m.bookingId}/cancel`)
        .set(bearer(ops.accessToken))
        .send({ reason: 'Trying to cancel' })
        .expect(409);
    });

    it('five wrong codes lock it for a while', async () => {
      const m = await handedOver();
      const { code } = await codeOf(m.lender, m.bookingId);
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 4; i >= 0; i--) {
        const res = await post(m.borrower, `${m.bookingId}/return`, {
          code: wrong,
          photoKeys: ['a', 'b'],
        }).expect(400);
        expect(res.body.error.details.triesLeft).toBe(i);
      }
      const locked = await post(m.borrower, `${m.bookingId}/return`, {
        code,
        photoKeys: ['a', 'b'],
      }).expect(429);
      expect(locked.body.error.code).toBe('BOOKING_CODE_LOCKED');
    });

    it('no-show: from the first day the lender cancels; the deposit comes back, the rent is theirs', async () => {
      const m = await paid(10, { payoutAccount: true });
      await post(m.lender, `${m.bookingId}/no-show`).expect(409);
      await datesFrom(m.bookingId, 0);
      expect((await detail(m.lender, m.bookingId)).can.noShow).toBe(true);
      await post(m.borrower, `${m.bookingId}/no-show`).expect(409);
      const b = (await post(m.lender, `${m.bookingId}/no-show`).expect(200)).body;
      expect(b).toMatchObject({ status: 'CANCELLED', cancelledBy: 'BORROWER' });
      expect(b.events.at(-1)).toMatchObject({ type: 'NO_SHOW', by: 'LENDER' });
      expect(b.rental.noShowAt).toEqual(expect.any(String));
      // Deposit only (₹1,000); the held rent is taken back and the lender's share paid.
      const refund = await prisma.refund.findFirstOrThrow({ where: { bookingId: m.bookingId } });
      expect(refund).toMatchObject({ kind: 'CANCELLATION', amountPaise: 100_000 });
      const transfers = await prisma.transfer.findMany({
        where: { bookingId: m.bookingId },
        orderBy: { createdAt: 'asc' },
      });
      expect(transfers.map((t) => [t.status, t.amountPaise, t.onHold])).toEqual([
        ['REVERSED', 27_000, true],
        ['RELEASED', 27_000, false],
      ]);
      const { net } = await ledgerFor(m.bookingId);
      expect(net).toMatchObject({ DEPOSIT_HELD: 0, LENDER_PAYABLE: 0 });
    });
  });

  // ── Return and completion ──

  describe('return and completion', () => {
    it('late return: the fee comes out of the deposit; completion releases the rent', async () => {
      const m = await handedOver();
      // It was due back two days ago (2 days of 2 are over).
      await datesFrom(m.bookingId, -3);
      const late = await detail(m.borrower, m.bookingId);
      const expectedDays = lateDaysFor(
        (await prisma.booking.findUniqueOrThrow({ where: { id: m.bookingId } })).endsOn,
        new Date(),
      );
      expect(late.rental).toMatchObject({ lateDays: expectedDays });
      expect(late.rental.lateFeePaise).toBe(Math.min(expectedDays * 15_000, 100_000));

      const back = await returned(m);
      expect(back.status).toBe('RETURNED');
      expect(back.rental).toMatchObject({
        returnedAt: expect.any(String),
        claimUntil: expect.any(String),
        lateDays: expectedDays,
        keptPaise: expectedDays * 15_000,
      });
      const fee = expectedDays * 15_000;
      expect(back.conditionReports.map((r: { stage: string }) => r.stage)).toEqual([
        'HANDOVER',
        'RETURN',
      ]);
      expect((await detail(m.lender, m.bookingId)).can).toMatchObject({
        dispute: true,
        addPhotos: true,
      });
      // The lender adds their return photos in the claim window.
      await post(m.lender, `${m.bookingId}/photos`, {
        stage: 'RETURN',
        photoKeys: await photos(m.lender, 1),
      }).expect(200);

      await claimWindowEnds(m.bookingId);
      const done = await detail(m.borrower, m.bookingId);
      expect(done.status).toBe('COMPLETED');
      expect(done.rental.completedAt).toEqual(expect.any(String));
      expect(done.events.at(-1)).toMatchObject({ type: 'COMPLETED', by: 'SYSTEM' });

      // Rent released; the late fee paid to the lender; the rest of the deposit back.
      const transfers = await prisma.transfer.findMany({
        where: { bookingId: m.bookingId },
        orderBy: { createdAt: 'asc' },
      });
      expect(transfers.map((t) => [t.status, t.amountPaise, t.fromDeposit])).toEqual([
        ['RELEASED', 27_000, false],
        ['RELEASED', fee, true],
      ]);
      expect(fake.calls.some((c) => c.method === 'releaseTransfer')).toBe(true);
      expect(done.payment.refunds).toEqual([
        expect.objectContaining({ kind: 'DEPOSIT_RETURN', amountPaise: 100_000 - fee }),
      ]);
      const { net } = await ledgerFor(m.bookingId);
      // Only Sajha's commission stays.
      expect(net).toMatchObject({ DEPOSIT_HELD: 0, LENDER_PAYABLE: 0, PLATFORM_REVENUE: 3_000 });
      expect(net.GATEWAY).toBe(-3_000);

      // Settling again (the sweep) moves nothing twice.
      await prisma.booking.update({
        where: { id: m.bookingId },
        data: { completedAt: new Date(Date.now() - 120_000) },
      });
      await app.get(PaymentsService).sweep();
      expect(await prisma.transfer.count({ where: { bookingId: m.bookingId } })).toBe(2);
      expect(await prisma.refund.count({ where: { bookingId: m.bookingId } })).toBe(1);
    });
  });

  // ── Reviews ──

  describe('reviews', () => {
    it('double-blind: hidden until both have written one, then public with averages', async () => {
      const m = await completed();
      expect((await detail(m.borrower, m.bookingId)).can.review).toBe(true);
      const mine = (
        await post(m.borrower, `${m.bookingId}/review`, {
          rating: 5,
          comment: 'Clean tent.',
        }).expect(200)
      ).body;
      expect(mine.reviews.mine).toMatchObject({ rating: 5, publishedAt: null });
      expect(mine.can.review).toBe(false);
      expect((await detail(m.lender, m.bookingId)).reviews.theirs).toBeNull();
      expect(
        (await http(app).get(`/v1/users/${m.lender.userId}/reviews`).expect(200)).body,
      ).toMatchObject({ ratingCount: 0, items: [] });
      const again = await post(m.borrower, `${m.bookingId}/review`, { rating: 1 }).expect(409);
      expect(again.body.error.code).toBe('REVIEW_NOT_ALLOWED');
      await post(m.borrower, `${m.bookingId}/review`, { rating: 6 }).expect(400);

      await post(m.lender, `${m.bookingId}/review`, { rating: 4 }).expect(200);
      const lenderView = await detail(m.lender, m.bookingId);
      expect(lenderView.reviews.theirs).toMatchObject({ rating: 5, comment: 'Clean tent.' });
      const ofLender = (await http(app).get(`/v1/users/${m.lender.userId}/reviews`).expect(200))
        .body;
      expect(ofLender).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
      expect(ofLender.items[0]).toMatchObject({
        rating: 5,
        authorRole: 'BORROWER',
        authorName: 'Rahul',
      });
      expect(
        (await http(app).get(`/v1/users/${m.borrower.userId}/reviews`).expect(200)).body,
      ).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
      // The borrower's review counts towards the item too.
      expect(
        (await http(app).get(`/v1/listings/${m.listingId}/reviews`).expect(200)).body,
      ).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
      const listing = (await http(app).get(`/v1/listings/${m.listingId}`).expect(200)).body;
      expect(listing).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
      expect(listing.lender).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    });

    it('a one-sided review goes public 7 days after completion', async () => {
      const m = await completed();
      await post(m.lender, `${m.bookingId}/review`, { rating: 3 }).expect(200);
      const worker = app.get(RentalsWorker);
      expect(await worker.process({ name: 'publish-reviews' })).toBe(0);
      await prisma.booking.update({
        where: { id: m.bookingId },
        data: { completedAt: new Date(Date.now() - 8 * DAY) },
      });
      expect(await worker.process({ name: 'publish-reviews' })).toBe(1);
      expect(
        (await http(app).get(`/v1/users/${m.borrower.userId}/reviews`).expect(200)).body,
      ).toMatchObject({ ratingAvg: 3, ratingCount: 1 });
      // Past the 14-day window, the borrower can't add theirs.
      await prisma.booking.update({
        where: { id: m.bookingId },
        data: { completedAt: new Date(Date.now() - 15 * DAY) },
      });
      await post(m.borrower, `${m.bookingId}/review`, { rating: 5 }).expect(409);
    });

    it('not before the rental is complete', async () => {
      const m = await handedOver();
      await post(m.borrower, `${m.bookingId}/review`, { rating: 5 }).expect(409);
    });
  });

  // ── Disputes ──

  describe('disputes', () => {
    it('the lender claims, the borrower replies, an admin keeps part of the deposit', async () => {
      const m = await handedOver();
      await returned(m);
      const claim = {
        reason: 'DAMAGE',
        description: 'The rain fly is torn along one seam.',
        claimPaise: 80_000,
      };
      const notReturned = await post(m.lender, `${m.bookingId}/dispute`, {
        ...claim,
        reason: 'NOT_RETURNED',
        photoKeys: [],
      }).expect(400);
      expect(notReturned.body.error.code).toBe('VALIDATION_FAILED');
      const tooMuch = await post(m.lender, `${m.bookingId}/dispute`, {
        ...claim,
        claimPaise: 150_000,
        photoKeys: [],
      }).expect(400);
      expect(tooMuch.body.error).toMatchObject({
        code: 'KEEP_TOO_LARGE',
        details: { maxPaise: 100_000 },
      });
      await post(m.borrower, `${m.bookingId}/dispute`, { ...claim, photoKeys: [] }).expect(409);

      const opened = (
        await post(m.lender, `${m.bookingId}/dispute`, {
          ...claim,
          photoKeys: await photos(m.lender, 2),
        }).expect(200)
      ).body;
      expect(opened.status).toBe('DISPUTED');
      expect(opened.dispute).toMatchObject({
        reason: 'DAMAGE',
        claimPaise: 80_000,
        status: 'OPEN',
      });
      expect(opened.dispute.evidence).toHaveLength(2);
      await post(m.lender, `${m.bookingId}/dispute`, { ...claim, photoKeys: [] }).expect(409);

      const borrowerView = await detail(m.borrower, m.bookingId);
      expect(borrowerView.can.respond).toBe(true);
      const replied = (
        await post(m.borrower, `${m.bookingId}/dispute/response`, {
          note: 'The tear was there at pickup; see my handover photos.',
          photoKeys: await photos(m.borrower, 1),
        }).expect(200)
      ).body;
      expect(replied.dispute).toMatchObject({ respondedAt: expect.any(String) });
      expect(replied.dispute.responsePhotos).toHaveLength(1);
      expect(replied.can.respond).toBe(false);
      await post(m.borrower, `${m.bookingId}/dispute/response`, {
        note: 'Again',
        photoKeys: [],
      }).expect(409);

      // Admins: Support reads, Ops decides.
      const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      const list = (
        await http(app).get('/v1/admin/disputes').set(bearer(support.accessToken)).expect(200)
      ).body;
      const row = list.items.find((d: { bookingId: string }) => d.bookingId === m.bookingId);
      expect(row).toMatchObject({ reason: 'DAMAGE', responded: true, status: 'OPEN' });
      const full = (
        await http(app)
          .get(`/v1/admin/disputes/${row.id}`)
          .set(bearer(support.accessToken))
          .expect(200)
      ).body;
      expect(full).toMatchObject({
        maxKeepPaise: 100_000,
        claimPaise: 80_000,
        responseNote: expect.stringContaining('tear was there'),
      });
      expect(full.conditionReports.map((r: { stage: string; by: string }) => r.stage)).toEqual([
        'HANDOVER',
        'RETURN',
      ]);
      await http(app)
        .post(`/v1/admin/disputes/${row.id}/resolve`)
        .set(bearer(support.accessToken))
        .send({ keptPaise: 60_000, note: 'Split' })
        .expect(403);
      const over = await http(app)
        .post(`/v1/admin/disputes/${row.id}/resolve`)
        .set(bearer(ops.accessToken))
        .send({ keptPaise: 120_000, note: 'Too much' })
        .expect(400);
      expect(over.body.error.code).toBe('KEEP_TOO_LARGE');
      const resolved = (
        await http(app)
          .post(`/v1/admin/disputes/${row.id}/resolve`)
          .set(bearer(ops.accessToken))
          .send({ keptPaise: 60_000, note: 'The tear is new; the lender keeps ₹600.' })
          .expect(200)
      ).body;
      expect(resolved).toMatchObject({ status: 'RESOLVED', keptPaise: 60_000 });

      const done = await detail(m.borrower, m.bookingId);
      expect(done.status).toBe('COMPLETED');
      expect(done.events.at(-1)).toMatchObject({ type: 'DISPUTE_RESOLVED', by: 'ADMIN' });
      expect(done.dispute).toMatchObject({ status: 'RESOLVED', keptPaise: 60_000 });
      expect(done.payment.refunds).toEqual([
        expect.objectContaining({ kind: 'DEPOSIT_RETURN', amountPaise: 40_000 }),
      ]);
      const kept = await prisma.transfer.findFirstOrThrow({
        where: { bookingId: m.bookingId, fromDeposit: true },
      });
      expect(kept).toMatchObject({ amountPaise: 60_000, status: 'RELEASED', onHold: false });
      const { net } = await ledgerFor(m.bookingId);
      expect(net).toMatchObject({ DEPOSIT_HELD: 0, LENDER_PAYABLE: 0 });
      // Both are told by email, with the split and the note.
      await sendQueuedEmails(app);
      for (const user of [m.borrower, m.lender]) {
        const { email } = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
        const decision = (await emailsTo(email!)).find((e) => e.subject.startsWith('Decision on'));
        expect(decision?.text).toContain('Back to the borrower: ₹400');
        expect(decision?.text).toContain('The tear is new; the lender keeps ₹600.');
      }
      expect(
        await prisma.auditLog.count({
          where: { action: 'admin.dispute.resolve', targetId: m.bookingId },
        }),
      ).toBe(1);
      // Decided once.
      await http(app)
        .post(`/v1/admin/disputes/${row.id}/resolve`)
        .set(bearer(ops.accessToken))
        .send({ keptPaise: 0, note: 'Again' })
        .expect(409);
    });

    it('after the claim window, it’s too late', async () => {
      const m = await handedOver();
      await returned(m);
      await prisma.booking.update({
        where: { id: m.bookingId },
        data: { returnedAt: new Date(Date.now() - 25 * 3_600_000) },
      });
      const late = await post(m.lender, `${m.bookingId}/dispute`, {
        reason: 'DAMAGE',
        description: 'Found a tear later on.',
        claimPaise: 10_000,
        photoKeys: [],
      }).expect(409);
      expect(late.body.error.code).toBe('DISPUTE_WINDOW_CLOSED');
    });

    it('not returned: the lender can claim the whole deposit once 2 days overdue', async () => {
      const m = await handedOver();
      const claim = {
        reason: 'NOT_RETURNED',
        description: 'No reply for days and the tent is not back.',
        claimPaise: 100_000,
        photoKeys: [],
      };
      // Due by tonight: not yet.
      await post(m.lender, `${m.bookingId}/dispute`, claim).expect(409);
      await datesFrom(m.bookingId, -4); // ended 3 days ago
      expect((await detail(m.lender, m.bookingId)).can.dispute).toBe(true);
      const b = (await post(m.lender, `${m.bookingId}/dispute`, claim).expect(200)).body;
      expect(b.status).toBe('DISPUTED');
      // Still out: the late fee keeps growing on the page.
      expect(b.rental.lateDays).toBeGreaterThanOrEqual(3);
    });
  });

  // ── Reminders ──

  it('reminders: pickup, due today and overdue, once a day; overdue also by SMS', async () => {
    const pickup = await paid(10);
    await datesFrom(pickup.bookingId, 1);
    const dueToday = await handedOver();
    await datesFrom(dueToday.bookingId, -1); // 2 days: yesterday and today
    const overdue = await handedOver();
    await datesFrom(overdue.bookingId, -2); // ended yesterday: 1 day late

    const worker = app.get(RentalsWorker);
    await worker.process({ name: 'reminders' });
    const types = async (user: UserSession, bookingId: string) =>
      (
        await prisma.notification.findMany({
          where: {
            userId: user.userId,
            type: { startsWith: 'booking.reminder' },
            data: { path: ['bookingId'], equals: bookingId },
          },
        })
      ).map((n) => n.type);
    expect(await types(pickup.borrower, pickup.bookingId)).toEqual(['booking.reminder.pickup']);
    expect(await types(pickup.lender, pickup.bookingId)).toEqual(['booking.reminder.pickup']);
    expect(await types(dueToday.borrower, dueToday.bookingId)).toEqual([
      'booking.reminder.due_today',
    ]);
    expect(await types(overdue.borrower, overdue.bookingId)).toEqual(['booking.reminder.overdue']);
    expect(await types(overdue.lender, overdue.bookingId)).toEqual(['booking.reminder.overdue']);
    expect(sms.overdue.filter((s) => s.phone === overdue.borrower.phone)).toEqual([
      expect.objectContaining({ daysLate: 1 }),
    ]);

    // An hour later: nothing new.
    await worker.process({ name: 'reminders' });
    expect(await types(overdue.borrower, overdue.bookingId)).toHaveLength(1);
    expect(sms.overdue.filter((s) => s.phone === overdue.borrower.phone)).toHaveLength(1);
  });

  it('a borrower who turned off SMS reminders still gets the in-app one, without the SMS', async () => {
    const overdue = await handedOver();
    await datesFrom(overdue.bookingId, -2);
    await http(app)
      .put('/v1/me/notification-preferences')
      .set(bearer(overdue.borrower.accessToken))
      .send({ smsReminders: false })
      .expect(200);

    await app.get(RentalsWorker).process({ name: 'reminders' });
    const reminders = await prisma.notification.count({
      where: {
        userId: overdue.borrower.userId,
        type: 'booking.reminder.overdue',
        data: { path: ['bookingId'], equals: overdue.bookingId },
      },
    });
    expect(reminders).toBe(1);
    expect(sms.overdue.filter((s) => s.phone === overdue.borrower.phone)).toEqual([]);
  });
});
