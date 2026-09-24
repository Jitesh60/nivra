import type { INestApplication } from '@nestjs/common';
import { encrypt } from '../../src/common/crypto/crypto.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import type { FakePaymentProvider } from '../../src/providers/payments/fake-payment.provider.js';
import { TEST_ENV } from '../create-test-app.js';
import { http, type UserSession } from './auth.js';
import type { InMemorySmsProvider } from './in-memory-sms.js';
import { isoDay, liveListing, verifiedUser } from './market.js';

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const PAYOUT = {
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

export interface PaymentsContext {
  app: INestApplication;
  sms: InMemorySmsProvider;
  prisma: PrismaService;
  fake: FakePaymentProvider;
}

let seq = 0;

/**
 * Booking-and-payment steps shared by the payments and rentals specs. Takes
 * the context lazily: specs create the app in `beforeAll`.
 */
export function paymentHelpers(ctx: () => PaymentsContext) {
  /** A booking waiting for payment: ₹150/day × 2 days + ₹1,000 deposit. */
  async function awaitingPayment(from = 10, opts: { payoutAccount?: boolean; days?: number } = {}) {
    const { app, sms, prisma } = ctx();
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
      .send({ listingId, startDate: isoDay(from), endDate: isoDay(from + (opts.days ?? 2) - 1) })
      .expect(201);
    await http(app)
      .post(`/v1/bookings/${booking.body.id}/accept`)
      .set(bearer(lender.accessToken))
      .expect(200);
    return { lender, borrower, listingId, bookingId: booking.body.id as string };
  }

  const pay = (user: UserSession, bookingId: string) =>
    http(ctx().app).post(`/v1/bookings/${bookingId}/pay`).set(bearer(user.accessToken));

  const devCheckout = (
    user: UserSession,
    orderId: string,
    outcome: 'success' | 'failure',
    webhook: 'now' | 'never' = 'now',
  ) =>
    http(ctx().app)
      .post(`/v1/dev/payments/${orderId}/checkout`)
      .set(bearer(user.accessToken))
      .send({ outcome, webhook })
      .expect(200);

  const detail = async (user: UserSession, id: string) =>
    (await http(ctx().app).get(`/v1/bookings/${id}`).set(bearer(user.accessToken)).expect(200))
      .body;

  /** Pays through the fake checkout, webhook first. */
  async function paid(from = 10, opts: { payoutAccount?: boolean; days?: number } = {}) {
    const m = await awaitingPayment(from, opts);
    const order = (await pay(m.borrower, m.bookingId).expect(200)).body;
    await devCheckout(m.borrower, order.orderId, 'success', 'now');
    return { ...m, orderId: order.orderId as string };
  }

  /** A signed Razorpay webhook, over HTTP with the raw body. */
  function webhook(event: string, payload: Record<string, unknown>, eventId?: string) {
    const hook = ctx().fake.webhook(event, payload);
    return http(ctx().app)
      .post('/v1/payments/webhook')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', hook.signature)
      .set('x-razorpay-event-id', eventId ?? hook.eventId)
      .send(hook.body);
  }

  /** The booking's ledger lines and the net (credit − debit) per account. */
  async function ledgerFor(bookingId: string) {
    const lines = await ctx().prisma.ledgerEntry.findMany({ where: { bookingId } });
    const net: Record<string, number> = {};
    for (const l of lines) net[l.account] = (net[l.account] ?? 0) + l.creditPaise - l.debitPaise;
    return { lines, net };
  }

  /**
   * Moves the rental start (midnight IST) to the first one more than [minHours]
   * away, so pickup is between minHours and minHours + 24 hours from now. The
   * rental keeps its length.
   */
  async function startIn(bookingId: string, minHours: number) {
    const prisma = ctx().prisma;
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    const target = new Date(Date.now() + minHours * 3_600_000 + 5.5 * 3_600_000);
    const day = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate() + 1),
    );
    await prisma.booking.update({
      where: { id: bookingId },
      data: { startsOn: day, endsOn: new Date(day.getTime() + (b.days - 1) * 86_400_000) },
    });
  }

  return { awaitingPayment, pay, devCheckout, detail, paid, webhook, ledgerFor, startIn };
}
