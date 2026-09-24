import type { INestApplication } from '@nestjs/common';
import { encrypt } from '../src/common/crypto/crypto.js';
import { BookingWorker } from '../src/modules/bookings/booking-worker.js';
import { lenderShare } from '../src/modules/payments/ledger.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { FakePaymentProvider } from '../src/providers/payments/fake-payment.provider.js';
import { createTestApp, TEST_ENV } from './create-test-app.js';
import { createAdmin, flushRedis, http, loginAdmin, type UserSession } from './helpers/auth.js';
import type { InMemorySmsProvider } from './helpers/in-memory-sms.js';
import { isoDay, liveListing, verifiedUser } from './helpers/market.js';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
let seq = 0;
const PAYOUT = {
  beneficiaryName: 'Asha Patil',
  accountNumber: '50100123456789',
  ifsc: 'hdfc0001234',
  pan: 'abcde1234f',
  email: 'asha@example.com',
  street: 'Flat 4B, Sai Residency, Paud Road',
  city: 'Pune',
  state: 'Maharashtra',
  postalCode: '411038',
};

describe('Payments, refunds & payouts (e2e)', () => {
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

  /** A booking waiting for payment: ₹150/day × 2 days + ₹1,000 deposit. */
  async function awaitingPayment(from = 10, opts: { payoutAccount?: boolean } = {}) {
    const lender = await verifiedUser(app, sms, 'Asha Patil');
    const borrower = await verifiedUser(app, sms, 'Rahul Sharma');
    const listingId = await liveListing(app, lender.userId, { title: `Tent ${++seq}` });
    await prisma.listing.update({
      where: { id: listingId },
      data: {
        exactAddressEnc: encrypt(
          'Flat 4B, Sai Residency, Paud Road',
          Buffer.from(TEST_ENV.ADDRESS_ENC_KEY, 'base64'),
        ),
      },
    });
    if (opts.payoutAccount) {
      await http(app)
        .put('/v1/me/payout-account')
        .set(bearer(lender.accessToken))
        .send(PAYOUT)
        .expect(200);
    }
    const booking = await http(app)
      .post('/v1/bookings')
      .set(bearer(borrower.accessToken))
      .send({ listingId, startDate: isoDay(from), endDate: isoDay(from + 1) })
      .expect(201);
    await http(app)
      .post(`/v1/bookings/${booking.body.id}/accept`)
      .set(bearer(lender.accessToken))
      .expect(200);
    return { lender, borrower, listingId, bookingId: booking.body.id as string };
  }

  const pay = (user: UserSession, bookingId: string) =>
    http(app).post(`/v1/bookings/${bookingId}/pay`).set(bearer(user.accessToken));

  const devCheckout = (
    user: UserSession,
    orderId: string,
    outcome: 'success' | 'failure',
    webhook: 'now' | 'never' = 'now',
  ) =>
    http(app)
      .post(`/v1/dev/payments/${orderId}/checkout`)
      .set(bearer(user.accessToken))
      .send({ outcome, webhook })
      .expect(200);

  const detail = async (user: UserSession, id: string) =>
    (await http(app).get(`/v1/bookings/${id}`).set(bearer(user.accessToken)).expect(200)).body;

  /** Pays through the fake checkout, webhook first. */
  async function paid(from = 10, opts: { payoutAccount?: boolean } = {}) {
    const m = await awaitingPayment(from, opts);
    const order = (await pay(m.borrower, m.bookingId).expect(200)).body;
    await devCheckout(m.borrower, order.orderId, 'success', 'now');
    return { ...m, orderId: order.orderId as string };
  }

  /** A signed Razorpay webhook, over HTTP with the raw body. */
  function webhook(event: string, payload: Record<string, unknown>, eventId?: string) {
    const hook = fake.webhook(event, payload);
    return http(app)
      .post('/v1/payments/webhook')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', hook.signature)
      .set('x-razorpay-event-id', eventId ?? hook.eventId)
      .send(hook.body);
  }

  async function ledgerFor(bookingId: string) {
    const lines = await prisma.ledgerEntry.findMany({ where: { bookingId } });
    const net: Record<string, number> = {};
    for (const l of lines) net[l.account] = (net[l.account] ?? 0) + l.creditPaise - l.debitPaise;
    return { lines, net };
  }

  /**
   * Moves the rental start (midnight IST) to the first one more than [minHours]
   * away, so pickup is between minHours and minHours + 24 hours from now.
   */
  async function startIn(bookingId: string, minHours: number) {
    // Rentals start at midnight IST (18:30 UTC the day before).
    const target = new Date(Date.now() + minHours * 3_600_000 + 5.5 * 3_600_000);
    const day = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate() + 1),
    );
    await prisma.booking.update({
      where: { id: bookingId },
      data: { startsOn: day, endsOn: new Date(day.getTime() + 86_400_000) },
    });
  }

  describe('checkout', () => {
    it('verify confirms at once; the webhook after it changes nothing', async () => {
      const m = await awaitingPayment();
      const denied = await pay(m.lender, m.bookingId).expect(409);
      expect(denied.body.error.code).toBe('PAYMENT_NOT_ALLOWED');

      const order = (await pay(m.borrower, m.bookingId).expect(200)).body;
      expect(order).toMatchObject({
        provider: 'fake',
        keyId: expect.stringMatching(/^rzp_test_/),
        amountPaise: 130_000,
        currency: 'INR',
        prefill: { name: 'Rahul Sharma', contact: m.borrower.phone },
      });
      // Opening checkout again reuses the order.
      expect((await pay(m.borrower, m.bookingId).expect(200)).body.orderId).toBe(order.orderId);

      const sheet = (await devCheckout(m.borrower, order.orderId, 'success', 'never')).body;
      const forged = await http(app)
        .post('/v1/payments/verify')
        .set(bearer(m.borrower.accessToken))
        .send({ orderId: order.orderId, paymentId: sheet.paymentId, signature: 'ab'.repeat(32) })
        .expect(400);
      expect(forged.body.error.code).toBe('PAYMENT_SIGNATURE_INVALID');
      const verified = await http(app)
        .post('/v1/payments/verify')
        .set(bearer(m.borrower.accessToken))
        .send({ orderId: order.orderId, paymentId: sheet.paymentId, signature: sheet.signature })
        .expect(200);
      expect(verified.body).toEqual({ bookingId: m.bookingId, status: 'CONFIRMED' });

      // Razorpay's webhook arrives afterwards (twice): no second capture.
      const entity = {
        id: sheet.paymentId,
        order_id: order.orderId,
        amount: 130_000,
        method: 'upi',
        status: 'captured',
      };
      await webhook('payment.captured', { payment: { entity } }, 'evt_same').expect(200);
      const again = await webhook('payment.captured', { payment: { entity } }, 'evt_same').expect(
        200,
      );
      expect(again.body).toEqual({ status: 'duplicate' });
      const { lines, net } = await ledgerFor(m.bookingId);
      expect(lines.filter((l) => l.type === 'PAYMENT_CAPTURED')).toHaveLength(4);
      expect(net).toMatchObject({
        GATEWAY: -130_000,
        DEPOSIT_HELD: 100_000,
        LENDER_PAYABLE: lenderShare(30_000, 1000),
        PLATFORM_REVENUE: 3_000,
      });

      const b = await detail(m.borrower, m.bookingId);
      expect(b).toMatchObject({
        status: 'CONFIRMED',
        pickupAddress: 'Flat 4B, Sai Residency, Paud Road',
        payment: { status: 'CAPTURED', amountPaise: 130_000, refundedPaise: 0 },
        can: { pay: false, cancel: true },
        expiresAt: null,
      });
      expect(b.events.at(-1)).toMatchObject({ type: 'PAID', by: 'SYSTEM' });
      expect((await detail(m.lender, m.bookingId)).pickupAddress).toBeNull();
      // No payout account yet: the lender's share waits for one.
      const transfer = await prisma.transfer.findFirstOrThrow({
        where: { bookingId: m.bookingId },
      });
      expect(transfer).toMatchObject({
        status: 'AWAITING_ACCOUNT',
        amountPaise: 27_000,
        onHold: true,
      });
      const bell = await http(app).get('/v1/me/notifications').set(bearer(m.lender.accessToken));
      expect(bell.body.items[0]).toMatchObject({ type: 'booking.confirmed' });
    });

    it('the webhook alone confirms; bad webhook signatures are refused', async () => {
      const m = await paid();
      expect((await detail(m.borrower, m.bookingId)).status).toBe('CONFIRMED');
      const hook = fake.webhook('payment.captured', { payment: { entity: {} } });
      const bad = await http(app)
        .post('/v1/payments/webhook')
        .set('content-type', 'application/json')
        .set('x-razorpay-signature', hook.signature)
        .send(`${hook.body} `)
        .expect(400);
      expect(bad.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    });

    it('a failed payment can be tried again on the same order', async () => {
      const m = await awaitingPayment();
      const order = (await pay(m.borrower, m.bookingId).expect(200)).body;
      const failed = await devCheckout(m.borrower, order.orderId, 'failure');
      expect(failed.body.error).toContain('declined');
      expect(
        await prisma.payment.findUniqueOrThrow({ where: { orderId: order.orderId } }),
      ).toMatchObject({ status: 'FAILED', failureReason: expect.stringContaining('declined') });
      const b = await detail(m.borrower, m.bookingId);
      expect(b).toMatchObject({ status: 'AWAITING_PAYMENT', can: { pay: true } });

      const retry = (await pay(m.borrower, m.bookingId).expect(200)).body;
      expect(retry.orderId).toBe(order.orderId);
      await devCheckout(m.borrower, retry.orderId, 'success');
      expect((await detail(m.borrower, m.bookingId)).status).toBe('CONFIRMED');
    });

    it('a payment that lands after the hold expired is refunded in full', async () => {
      const m = await awaitingPayment();
      const order = (await pay(m.borrower, m.bookingId).expect(200)).body;
      await prisma.booking.update({
        where: { id: m.bookingId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await app.get(BookingWorker).process({ name: 'expire', data: { bookingId: m.bookingId } });
      await pay(m.borrower, m.bookingId).expect(409);

      await devCheckout(m.borrower, order.orderId, 'success');
      const b = await detail(m.borrower, m.bookingId);
      expect(b.status).toBe('EXPIRED');
      expect(b.payment).toMatchObject({
        status: 'REFUNDED',
        refundedPaise: 130_000,
        refunds: [expect.objectContaining({ kind: 'LATE_PAYMENT', status: 'PROCESSED' })],
      });
      const { net } = await ledgerFor(m.bookingId);
      expect(Object.values(net).every((v) => v === 0)).toBe(true);
    });
  });

  describe('after confirmation', () => {
    it('contact details are no longer masked in the chat', async () => {
      const m = await awaitingPayment();
      const c = (await detail(m.borrower, m.bookingId)).conversationId;
      const say = (u: UserSession, body: string) =>
        http(app)
          .post(`/v1/conversations/${c}/messages`)
          .set(bearer(u.accessToken))
          .send({ type: 'TEXT', body, clientId: `c${Date.now()}${Math.random()}` })
          .expect(201);
      await say(m.lender, 'Call me on 98765 43210');
      const before = await http(app)
        .get(`/v1/conversations/${c}/messages`)
        .set(bearer(m.borrower.accessToken));
      expect(before.body.items[0].body).toBe('Call me on •••');

      const order = (await pay(m.borrower, m.bookingId).expect(200)).body;
      await devCheckout(m.borrower, order.orderId, 'success');
      await say(m.lender, 'Or on asha@example.com');
      const after = await http(app)
        .get(`/v1/conversations/${c}/messages`)
        .set(bearer(m.borrower.accessToken));
      const texts = after.body.items.map((x: { body: string; masked: boolean }) => [
        x.body,
        x.masked,
      ]);
      expect(texts).toContainEqual(['Or on asha@example.com', false]);
      expect(texts).toContainEqual(['Call me on 98765 43210', false]);
    });
  });

  describe('cancelling a paid booking', () => {
    it('more than 48 h before: everything back, and the held transfer is reversed', async () => {
      const m = await paid(10, { payoutAccount: true });
      const held = await prisma.transfer.findFirstOrThrow({ where: { bookingId: m.bookingId } });
      expect(held).toMatchObject({ status: 'ON_HOLD', amountPaise: 27_000 });
      const preview = await http(app)
        .get(`/v1/bookings/${m.bookingId}/cancel-preview`)
        .set(bearer(m.borrower.accessToken))
        .expect(200);
      expect(preview.body).toMatchObject({ tier: 'FULL', refundPaise: 130_000 });

      await http(app)
        .post(`/v1/bookings/${m.bookingId}/cancel`)
        .set(bearer(m.borrower.accessToken))
        .send({ reason: 'Trip cancelled' })
        .expect(200);
      const b = await detail(m.borrower, m.bookingId);
      expect(b).toMatchObject({ status: 'CANCELLED', pickupAddress: null });
      expect(b.payment).toMatchObject({ status: 'REFUNDED', refundedPaise: 130_000 });
      expect(await prisma.transfer.findUniqueOrThrow({ where: { id: held.id } })).toMatchObject({
        status: 'REVERSED',
      });
      expect(await prisma.transfer.count({ where: { bookingId: m.bookingId } })).toBe(1);
      const { net } = await ledgerFor(m.bookingId);
      expect(Object.values(net).every((v) => v === 0)).toBe(true);
      const bell = await http(app).get('/v1/me/notifications').set(bearer(m.borrower.accessToken));
      expect(bell.body.items.map((n: { type: string }) => n.type)).toContain('payment.refund');
    });

    it('24–48 h before: half the rent and the deposit back; the lender is paid for the rest', async () => {
      const m = await paid(10, { payoutAccount: true });
      await startIn(m.bookingId, 24);
      const preview = await http(app)
        .get(`/v1/bookings/${m.bookingId}/cancel-preview`)
        .set(bearer(m.borrower.accessToken))
        .expect(200);
      expect(preview.body).toMatchObject({
        tier: 'HALF_RENT',
        rentPaise: 15_000,
        refundPaise: 115_000,
      });
      await http(app)
        .post(`/v1/bookings/${m.bookingId}/cancel`)
        .set(bearer(m.borrower.accessToken))
        .send({ reason: 'Plans changed' })
        .expect(200);
      const payment = (await detail(m.borrower, m.bookingId)).payment;
      expect(payment).toMatchObject({ status: 'PARTIALLY_REFUNDED', refundedPaise: 115_000 });
      const transfers = await prisma.transfer.findMany({
        where: { bookingId: m.bookingId },
        orderBy: { createdAt: 'asc' },
      });
      expect(transfers.map((t) => [t.status, t.onHold, t.amountPaise])).toEqual([
        ['REVERSED', true, 27_000],
        ['RELEASED', false, lenderShare(15_000, 1000)],
      ]);
      const { net } = await ledgerFor(m.bookingId);
      expect(net).toMatchObject({ DEPOSIT_HELD: 0, LENDER_PAYABLE: 0, PLATFORM_REVENUE: 1_500 });
      const earnings = await http(app).get('/v1/me/earnings').set(bearer(m.lender.accessToken));
      expect(earnings.body.totals).toMatchObject({ paidPaise: 13_500, onHoldPaise: 0 });
    });

    it('under 24 h: only the deposit back; the lender or Sajha cancelling refunds everything', async () => {
      const late = await paid();
      await startIn(late.bookingId, 0);
      await http(app)
        .post(`/v1/bookings/${late.bookingId}/cancel`)
        .set(bearer(late.borrower.accessToken))
        .send({ reason: 'Sick' })
        .expect(200);
      expect((await detail(late.borrower, late.bookingId)).payment.refundedPaise).toBe(100_000);

      const byLender = await paid();
      await startIn(byLender.bookingId, 0);
      const preview = await http(app)
        .get(`/v1/bookings/${byLender.bookingId}/cancel-preview`)
        .set(bearer(byLender.lender.accessToken))
        .expect(200);
      expect(preview.body).toMatchObject({ tier: 'FULL', refundPaise: 130_000 });
      await http(app)
        .post(`/v1/bookings/${byLender.bookingId}/cancel`)
        .set(bearer(byLender.lender.accessToken))
        .send({ reason: 'Tent is torn' })
        .expect(200);
      expect((await detail(byLender.borrower, byLender.bookingId)).payment.refundedPaise).toBe(
        130_000,
      );

      const bySajha = await paid();
      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      await http(app)
        .post(`/v1/admin/bookings/${bySajha.bookingId}/cancel`)
        .set(bearer(ops.accessToken))
        .send({ reason: 'Listing removed' })
        .expect(200);
      expect((await detail(bySajha.borrower, bySajha.bookingId)).payment.refundedPaise).toBe(
        130_000,
      );
    });

    it('a refund the provider fails is retried by the sweep', async () => {
      const m = await paid();
      fake.failNext = 1;
      await http(app)
        .post(`/v1/bookings/${m.bookingId}/cancel`)
        .set(bearer(m.borrower.accessToken))
        .send({ reason: 'Trip cancelled' })
        .expect(200);
      const failed = await prisma.refund.findFirstOrThrow({ where: { bookingId: m.bookingId } });
      expect(failed).toMatchObject({ status: 'FAILED', attempts: 1 });
      expect((await ledgerFor(m.bookingId)).lines.some((l) => l.type === 'REFUND')).toBe(false);

      await app.get(PaymentsService).sweep();
      expect(await prisma.refund.findUniqueOrThrow({ where: { id: failed.id } })).toMatchObject({
        status: 'PROCESSED',
        attempts: 2,
      });
      const { net } = await ledgerFor(m.bookingId);
      expect(Object.values(net).every((v) => v === 0)).toBe(true);
    });
  });

  describe('payouts', () => {
    it('set up once; earnings wait for the account, then go out on hold', async () => {
      const m = await paid();
      const bad = await http(app)
        .put('/v1/me/payout-account')
        .set(bearer(m.lender.accessToken))
        .send({ ...PAYOUT, ifsc: 'HDFC1234' })
        .expect(400);
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
      let earnings = await http(app).get('/v1/me/earnings').set(bearer(m.lender.accessToken));
      expect(earnings.body).toMatchObject({
        account: null,
        totals: { awaitingAccountPaise: 27_000, onHoldPaise: 0 },
      });

      fake.nextAccountStatus = 'PENDING';
      const account = await http(app)
        .put('/v1/me/payout-account')
        .set(bearer(m.lender.accessToken))
        .send(PAYOUT)
        .expect(200);
      fake.nextAccountStatus = 'ACTIVATED';
      expect(account.body).toEqual({
        status: 'PENDING',
        statusReason: null,
        beneficiaryName: 'Asha Patil',
        bankLast4: '6789',
        ifsc: 'HDFC0001234',
        panLast4: '234F',
      });
      const again = await http(app)
        .put('/v1/me/payout-account')
        .set(bearer(m.lender.accessToken))
        .send(PAYOUT)
        .expect(409);
      expect(again.body.error.code).toBe('PAYOUT_ACCOUNT_INVALID');

      // Razorpay activates it: the waiting transfer goes out, held until the return.
      const row = await prisma.payoutAccount.findUniqueOrThrow({
        where: { userId: m.lender.userId },
      });
      await webhook('account.activated', {
        account: { entity: { id: row.providerAccountId } },
      }).expect(200);
      earnings = await http(app).get('/v1/me/earnings').set(bearer(m.lender.accessToken));
      expect(earnings.body.account.status).toBe('ACTIVATED');
      expect(earnings.body.totals).toMatchObject({ onHoldPaise: 27_000, awaitingAccountPaise: 0 });
      expect(earnings.body.items[0]).toMatchObject({ bookingId: m.bookingId, status: 'ON_HOLD' });
    });
  });

  describe('admin', () => {
    it('payments, a partial goodwill refund, payouts and a balanced ledger', async () => {
      const m = await paid(10, { payoutAccount: true });
      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
      const list = await http(app)
        .get('/v1/admin/payments')
        .query({ q: m.orderId })
        .set(bearer(support.accessToken))
        .expect(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({
          orderId: m.orderId,
          status: 'CAPTURED',
          borrowerName: 'Rahul Sharma',
        }),
      ]);
      const id = list.body.items[0].id as string;
      const shown = await http(app)
        .get(`/v1/admin/payments/${id}`)
        .set(bearer(support.accessToken))
        .expect(200);
      expect(shown.body).toMatchObject({ bookingStatus: 'CONFIRMED', refundablePaise: 130_000 });
      expect(shown.body.transfers).toEqual([expect.objectContaining({ status: 'ON_HOLD' })]);
      expect(shown.body.ledger.length).toBeGreaterThanOrEqual(6);

      await http(app)
        .post(`/v1/admin/payments/${id}/refund`)
        .set(bearer(support.accessToken))
        .send({ amountPaise: 5_000, reason: 'Sorry' })
        .expect(403);
      const tooMuch = await http(app)
        .post(`/v1/admin/payments/${id}/refund`)
        .set(bearer(ops.accessToken))
        .send({ amountPaise: 999_999, reason: 'Oops' })
        .expect(400);
      expect(tooMuch.body.error).toMatchObject({
        code: 'REFUND_TOO_LARGE',
        details: { refundablePaise: 130_000 },
      });
      const refunded = await http(app)
        .post(`/v1/admin/payments/${id}/refund`)
        .set(bearer(ops.accessToken))
        .send({ amountPaise: 5_000, reason: 'Late pickup, goodwill' })
        .expect(200);
      expect(refunded.body).toMatchObject({
        status: 'PARTIALLY_REFUNDED',
        refundedPaise: 5_000,
        refundablePaise: 125_000,
        refunds: [expect.objectContaining({ kind: 'MANUAL', adminName: 'Test OPS' })],
      });
      expect((await ledgerFor(m.bookingId)).net.GOODWILL).toBe(-5_000);

      const payouts = await http(app)
        .get('/v1/admin/payouts')
        .query({ status: 'ON_HOLD' })
        .set(bearer(support.accessToken))
        .expect(200);
      expect(payouts.body.items.map((t: { bookingId: string }) => t.bookingId)).toContain(
        m.bookingId,
      );

      const summary = await http(app)
        .get('/v1/admin/ledger/summary')
        .set(bearer(support.accessToken))
        .expect(200);
      expect(summary.body).toMatchObject({
        balanced: true,
        unbalancedTxns: [],
        capturedWithoutLedger: 0,
      });
      expect(summary.body.totalDebitPaise).toBe(summary.body.totalCreditPaise);
    });

    it('Ops retries a failed transfer', async () => {
      // The provider fails the held transfer of a freshly paid booking.
      const next = await awaitingPayment(12);
      await http(app)
        .put('/v1/me/payout-account')
        .set(bearer(next.lender.accessToken))
        .send(PAYOUT)
        .expect(200);
      const order = (await pay(next.borrower, next.bookingId).expect(200)).body;
      fake.failNext = 1;
      await devCheckout(next.borrower, order.orderId, 'success');
      const t = await prisma.transfer.findFirstOrThrow({ where: { bookingId: next.bookingId } });
      expect(t).toMatchObject({ status: 'FAILED', providerTransferId: null });

      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      const retried = await http(app)
        .post(`/v1/admin/transfers/${t.id}/retry`)
        .set(bearer(ops.accessToken))
        .expect(200);
      expect(retried.body).toMatchObject({ status: 'ON_HOLD', attempts: 1 });
      await http(app)
        .post(`/v1/admin/transfers/${t.id}/retry`)
        .set(bearer(ops.accessToken))
        .expect(409);
    });
  });
});
