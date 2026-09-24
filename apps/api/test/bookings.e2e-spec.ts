import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { BookingWorker } from '../src/modules/bookings/booking-worker.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { StorageService } from '../src/providers/storage/storage.service.js';
import { createTestApp } from './create-test-app.js';
import {
  createAdmin,
  flushRedis,
  http,
  loginAdmin,
  loginUser,
  type UserSession,
} from './helpers/auth.js';
import type { InMemoryPushProvider } from './helpers/in-memory-push.js';
import type { InMemorySmsProvider } from './helpers/in-memory-sms.js';
import { isoDay, liveListing, verifiedUser } from './helpers/market.js';
import { photo, upload } from './helpers/uploads.js';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
let seq = 0;
const unique = (s: string) => `${s} ${Date.now()}-${++seq}`;

describe('Bookings & document sharing (e2e)', () => {
  let app: INestApplication;
  let sms: InMemorySmsProvider;
  let push: InMemoryPushProvider;
  let prisma: PrismaService;
  let worker: BookingWorker;
  let port: number;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ({ app, sms, push } = await createTestApp());
    prisma = app.get(PrismaService);
    worker = app.get(BookingWorker);
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  beforeEach(() => flushRedis(app));

  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });

  afterAll(async () => {
    await app.close();
  });

  async function pair(listing: Parameters<typeof liveListing>[2] = {}) {
    const lender = await verifiedUser(app, sms, 'Asha Patil');
    const borrower = await verifiedUser(app, sms, 'Rahul Sharma');
    const listingId = await liveListing(app, lender.userId, {
      title: unique('Tent'),
      ...listing,
    });
    return { lender, borrower, listingId };
  }

  const book = (user: UserSession, listingId: string, from: number, to: number) =>
    http(app)
      .post('/v1/bookings')
      .set(bearer(user.accessToken))
      .send({ listingId, startDate: isoDay(from), endDate: isoDay(to) });

  const act = (user: UserSession, id: string, action: string, body: object = {}) =>
    http(app).post(`/v1/bookings/${id}/${action}`).set(bearer(user.accessToken)).send(body);

  const detail = (user: UserSession, id: string) =>
    http(app).get(`/v1/bookings/${id}`).set(bearer(user.accessToken));

  const notifications = async (user: UserSession) =>
    (await http(app).get('/v1/me/notifications').set(bearer(user.accessToken)).expect(200))
      .body as {
      items: { type: string; title: string; body: string; bookingId: string }[];
      unread: number;
    };

  async function addDocument(user: UserSession, type: string) {
    const frontKey = await upload(app, user.accessToken, 'DOCUMENT', await photo(800, 500));
    const res = await http(app)
      .post('/v1/me/documents')
      .set(bearer(user.accessToken))
      .send({ type, frontKey })
      .expect(201);
    return res.body.id as string;
  }

  function connect(token: string): Promise<Socket> {
    const socket = io(`http://127.0.0.1:${port}/ws`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  function next<T>(socket: Socket, event: string, match: (p: T) => boolean = () => true) {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${event} within 3s`)), 3000);
      const handler = (payload: T) => {
        if (!match(payload)) return;
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      };
      socket.on(event, handler);
    });
  }

  describe('requesting', () => {
    it('needs a verified user, someone else’s listing and free dates; one open request each', async () => {
      const { lender, borrower, listingId } = await pair({ pricePerDayPaise: 20_000 });

      const unverified = await loginUser(app, sms);
      const denied = await book(unverified, listingId, 5, 6).expect(403);
      expect(denied.body.error.code).toBe('VERIFICATION_REQUIRED');
      const own = await book(lender, listingId, 5, 6).expect(400);
      expect(own.body.error.code).toBe('BOOKING_OWN_LISTING');

      const res = await book(borrower, listingId, 5, 7).expect(201);
      expect(res.body).toMatchObject({
        status: 'REQUESTED',
        source: 'REQUEST',
        role: 'BORROWER',
        days: 3,
        rentPaise: 60_000,
        depositPaise: 100_000,
        totalPaise: 160_000,
        other: { name: 'Asha Patil' },
        can: { accept: false, cancel: true },
      });
      expect(res.body.events).toEqual([
        expect.objectContaining({ type: 'REQUESTED', status: 'REQUESTED', by: 'BORROWER' }),
      ]);
      // The lender has a day to reply.
      const hoursLeft = (new Date(res.body.expiresAt).getTime() - Date.now()) / 3_600_000;
      expect(hoursLeft).toBeGreaterThan(23.9);
      expect(hoursLeft).toBeLessThanOrEqual(24);

      const again = await book(borrower, listingId, 10, 11).expect(409);
      expect(again.body.error.code).toBe('BOOKING_OPEN_EXISTS');

      // The chat has the request, and the lender is told.
      const chat = await http(app)
        .get(`/v1/conversations/${res.body.conversationId}/messages`)
        .set(bearer(lender.accessToken))
        .expect(200);
      expect(chat.body.items[0]).toMatchObject({ type: 'SYSTEM' });
      expect(chat.body.items[0].body).toContain('Booking requested');
      const conversation = await http(app)
        .get(`/v1/conversations/${res.body.conversationId}`)
        .set(bearer(borrower.accessToken))
        .expect(200);
      expect(conversation.body.openBookingId).toBe(res.body.id);
      const inbox = await notifications(lender);
      expect(inbox.items[0]).toMatchObject({
        type: 'booking.requested',
        title: 'New booking request',
        bookingId: res.body.id,
      });
      expect(inbox.items[0].body).toContain('Rahul wants');

      // Only the two people can see it; lists by side.
      const stranger = await verifiedUser(app, sms);
      await detail(stranger, res.body.id).expect(404);
      const asLender = await http(app)
        .get('/v1/bookings?role=LENDER')
        .set(bearer(lender.accessToken))
        .expect(200);
      expect(asLender.body.items.map((b: { id: string }) => b.id)).toContain(res.body.id);
      const past = await http(app)
        .get('/v1/bookings?role=BORROWER&scope=PAST')
        .set(bearer(borrower.accessToken))
        .expect(200);
      expect(past.body.items).toHaveLength(0);
    });

    it('refuses dates the listing’s rules or blocks rule out', async () => {
      const { borrower, listingId } = await pair({ minDays: 3 });
      const short = await book(borrower, listingId, 5, 5).expect(409);
      expect(short.body.error).toMatchObject({
        code: 'BOOKING_DATES_UNAVAILABLE',
        details: { reason: 'TOO_SHORT' },
      });
    });
  });

  describe('accept, decline, cancel', () => {
    it('only the lender answers; accepting without documents holds the dates for payment', async () => {
      const { lender, borrower, listingId } = await pair();
      const b = (await book(borrower, listingId, 8, 9).expect(201)).body;

      const notYours = await act(borrower, b.id, 'accept').expect(403);
      expect(notYours.body.error.code).toBe('BOOKING_NOT_ALLOWED');
      // The lender declines a request; they can't "cancel" it.
      const cancel = await act(lender, b.id, 'cancel', { reason: 'Busy' }).expect(409);
      expect(cancel.body.error.code).toBe('BOOKING_INVALID_TRANSITION');

      const accepted = await act(lender, b.id, 'accept').expect(200);
      expect(accepted.body).toMatchObject({
        status: 'AWAITING_PAYMENT',
        role: 'LENDER',
        can: { accept: false, cancel: true },
      });
      const minutesLeft = (new Date(accepted.body.expiresAt).getTime() - Date.now()) / 60_000;
      expect(minutesLeft).toBeGreaterThan(119);
      expect(minutesLeft).toBeLessThanOrEqual(120);
      expect((await notifications(borrower)).items[0].type).toBe('booking.accepted');

      // Held dates are off the market: public calendar, quote, search, other requests.
      const listing = await http(app).get(`/v1/listings/${listingId}`).expect(200);
      expect(listing.body.blocks).toContainEqual({ startsOn: isoDay(8), endsOn: isoDay(9) });
      const q = await http(app)
        .get(`/v1/listings/${listingId}/quote`)
        .query({ startDate: isoDay(9), endDate: isoDay(10) })
        .expect(200);
      expect(q.body).toMatchObject({ available: false, unavailableReason: 'BLOCKED' });
      const title = listing.body.title as string;
      const found = await http(app)
        .get('/v1/search')
        .query({
          lat: 18.5074,
          lng: 73.8077,
          radiusKm: 2,
          q: title,
          startDate: isoDay(9),
          endDate: isoDay(9),
        })
        .expect(200);
      expect(found.body.items.map((i: { id: string }) => i.id)).not.toContain(listingId);
      const other = await verifiedUser(app, sms);
      const clash = await book(other, listingId, 9, 12).expect(409);
      expect(clash.body.error.code).toBe('BOOKING_DATES_UNAVAILABLE');

      // The lender backs out: it counts against them, and the borrower is told.
      const cancelled = await act(lender, b.id, 'cancel', { reason: 'Tent is torn' }).expect(200);
      expect(cancelled.body).toMatchObject({
        status: 'CANCELLED',
        cancelledBy: 'LENDER',
        cancelReason: 'Tent is torn',
        expiresAt: null,
      });
      expect((await notifications(borrower)).items[0]).toMatchObject({
        type: 'booking.cancelled',
      });
      // The dates are free again.
      await book(other, listingId, 9, 12).expect(201);
    });

    it('decline with a reason; borrower cancels a request', async () => {
      const { lender, borrower, listingId } = await pair();
      const b = (await book(borrower, listingId, 8, 9).expect(201)).body;
      const declined = await act(lender, b.id, 'decline', { reason: 'Away that week' }).expect(200);
      expect(declined.body).toMatchObject({ status: 'DECLINED', declineReason: 'Away that week' });
      const told = (await notifications(borrower)).items[0];
      expect(told).toMatchObject({ type: 'booking.declined' });
      expect(told.body).toContain('Away that week');
      await act(lender, b.id, 'accept').expect(409);

      // A new request is allowed once the last one closed.
      const again = (await book(borrower, listingId, 12, 13).expect(201)).body;
      const cancelled = await act(borrower, again.id, 'cancel', { reason: 'Plans changed' }).expect(
        200,
      );
      expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancelledBy: 'BORROWER' });
      expect((await notifications(lender)).items[0].type).toBe('booking.cancelled');
      const past = await http(app)
        .get('/v1/bookings?role=BORROWER&scope=PAST')
        .set(bearer(borrower.accessToken))
        .expect(200);
      expect(past.body.items).toHaveLength(2);
    });

    it('two requests for the same dates can’t both be accepted, even at the same moment', async () => {
      const { lender, listingId } = await pair();
      const a = await verifiedUser(app, sms);
      const b = await verifiedUser(app, sms);
      const c = await verifiedUser(app, sms);
      const first = (await book(a, listingId, 20, 22).expect(201)).body;
      const second = (await book(b, listingId, 21, 23).expect(201)).body;
      const third = (await book(c, listingId, 22, 22).expect(201)).body;

      await act(lender, first.id, 'accept').expect(200);
      const taken = await act(lender, second.id, 'accept').expect(409);
      expect(taken.body.error.code).toBe('BOOKING_DATES_TAKEN');
      expect((await detail(b, second.id).expect(200)).body.status).toBe('REQUESTED');

      // Free the dates, then race two overlapping accepts.
      await act(a, first.id, 'cancel', { reason: 'Sorry' }).expect(200);
      const results = await Promise.all([
        act(lender, second.id, 'accept'),
        act(lender, third.id, 'accept'),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const held = await prisma.booking.count({
        where: { listingId, status: 'AWAITING_PAYMENT' },
      });
      expect(held).toBe(1);
    });
  });

  describe('documents', () => {
    it('accept → borrower shares an ID → lender views (logged) → approve → awaiting payment', async () => {
      const { lender, borrower, listingId } = await pair({ requiredDocs: ['GOVERNMENT_ID'] });
      const pan = await addDocument(borrower, 'PAN');
      const college = await addDocument(borrower, 'COLLEGE_ID');
      const b = (await book(borrower, listingId, 6, 7).expect(201)).body;
      expect(b.requiredDocs).toEqual([
        expect.objectContaining({
          docType: 'GOVERNMENT_ID',
          accepts: expect.arrayContaining(['PAN']),
        }),
      ]);

      const accepted = (await act(lender, b.id, 'accept').expect(200)).body;
      expect(accepted).toMatchObject({ status: 'AWAITING_DOCS', can: { reviewDocs: false } });
      const asked = (await notifications(borrower)).items.map((n) => n.type);
      expect(asked).toEqual(expect.arrayContaining(['booking.accepted', 'booking.docs_requested']));
      const requiredDocId = accepted.requiredDocs[0].id as string;
      expect((await detail(borrower, b.id)).body.can).toMatchObject({ shareDocs: true });

      // The wrong kind of document, or someone else's, is refused.
      const wrong = await act(borrower, b.id, 'documents', {
        shares: [{ requiredDocId, userDocumentId: college }],
      }).expect(400);
      expect(wrong.body.error.code).toBe('BOOKING_DOCS_MISMATCH');
      await act(lender, b.id, 'documents', {
        shares: [{ requiredDocId, userDocumentId: pan }],
      }).expect(403);

      const shared = await act(borrower, b.id, 'documents', {
        shares: [{ requiredDocId, userDocumentId: pan }],
      }).expect(200);
      expect(shared.body.status).toBe('AWAITING_DOCS');
      expect(shared.body.sharedDocuments).toEqual([
        expect.objectContaining({
          docType: 'PAN',
          status: 'SUBMITTED',
          verified: false,
          views: [],
        }),
      ]);
      await act(borrower, b.id, 'documents', {
        shares: [{ requiredDocId, userDocumentId: pan }],
      }).expect(409);

      // The lender opens it: a short link, a watermark, and a log the borrower can see.
      const lenderView = (await detail(lender, b.id).expect(200)).body;
      expect(lenderView.can).toMatchObject({ reviewDocs: true });
      const shareId = lenderView.sharedDocuments[0].id as string;
      expect(lenderView.sharedDocuments[0].viewable).toBe(true);
      const link = await http(app)
        .get(`/v1/bookings/${b.id}/documents/${shareId}/view`)
        .set(bearer(lender.accessToken))
        .expect(200);
      expect(link.body.watermark).toMatch(/^Shared with Asha Patil for booking #[0-9A-F]{6} · /);
      const file = await fetch(link.body.url);
      expect(file.status).toBe(200);
      expect(file.headers.get('cache-control')).toContain('no-store');
      await http(app)
        .get(`/v1/bookings/${b.id}/documents/${shareId}/view`)
        .set(bearer(borrower.accessToken))
        .expect(403);
      const views = (await detail(borrower, b.id)).body.sharedDocuments[0].views;
      expect(views).toEqual([expect.objectContaining({ viewerName: 'Asha Patil' })]);

      // The share is a copy: deleting the vault document doesn't touch it.
      await http(app)
        .delete(`/v1/me/documents/${pan}`)
        .set(bearer(borrower.accessToken))
        .expect(204);
      const approved = await act(lender, b.id, 'documents/approve').expect(200);
      expect(approved.body).toMatchObject({ status: 'AWAITING_PAYMENT' });
      expect(approved.body.sharedDocuments[0].status).toBe('APPROVED');
      expect((await notifications(borrower)).items[0].type).toBe('booking.docs_approved');
      expect(approved.body.events.map((e: { type: string }) => e.type)).toEqual([
        'REQUESTED',
        'ACCEPTED',
        'DOCS_SUBMITTED',
        'DOCS_APPROVED',
      ]);

      // Access ends when the booking closes, and the copy is purged after the retention window.
      await act(borrower, b.id, 'cancel', { reason: 'Found one nearer' }).expect(200);
      const ended = await http(app)
        .get(`/v1/bookings/${b.id}/documents/${shareId}/view`)
        .set(bearer(lender.accessToken))
        .expect(410);
      expect(ended.body.error.code).toBe('DOCUMENT_ACCESS_ENDED');
      const share = await prisma.bookingDocumentShare.findUniqueOrThrow({ where: { id: shareId } });
      await worker.process({ name: 'purge-shares', data: {} });
      expect(
        (await prisma.bookingDocumentShare.findUniqueOrThrow({ where: { id: shareId } })).purgedAt,
      ).toBeNull();
      await prisma.booking.update({
        where: { id: b.id },
        data: { closedAt: new Date(Date.now() - 31 * 86_400_000) },
      });
      await worker.process({ name: 'purge-shares', data: {} });
      const purged = await prisma.bookingDocumentShare.findUniqueOrThrow({
        where: { id: shareId },
      });
      expect(purged).toMatchObject({ frontKey: null, backKey: null });
      expect(purged.purgedAt).not.toBeNull();
      expect(await app.get(StorageService).head('private', share.frontKey!)).toBeNull();
    });

    it('the lender can reject the documents, which declines the booking', async () => {
      const { lender, borrower, listingId } = await pair({ requiredDocs: ['GOVERNMENT_ID'] });
      const dl = await addDocument(borrower, 'DRIVING_LICENCE');
      const b = (await book(borrower, listingId, 6, 7).expect(201)).body;
      const accepted = (await act(lender, b.id, 'accept').expect(200)).body;
      await act(borrower, b.id, 'documents', {
        shares: [{ requiredDocId: accepted.requiredDocs[0].id, userDocumentId: dl }],
      }).expect(200);
      const rejected = await act(lender, b.id, 'documents/reject', {
        reason: 'Photo is blurry',
      }).expect(200);
      expect(rejected.body).toMatchObject({ status: 'DECLINED', declineReason: 'Photo is blurry' });
      expect(rejected.body.sharedDocuments[0]).toMatchObject({
        status: 'REJECTED',
        viewable: false,
      });
      expect((await notifications(borrower)).items[0].title).toBe('Documents not accepted');
    });
  });

  describe('timers', () => {
    it('each waiting step expires when its time is up, and the jobs are safe to re-run', async () => {
      const { lender, borrower, listingId } = await pair();
      const b = (await book(borrower, listingId, 8, 9).expect(201)).body;

      // Not due yet: nothing happens.
      expect(await worker.process({ name: 'expire', data: { bookingId: b.id } })).toBe(false);
      await prisma.booking.update({
        where: { id: b.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await worker.process({ name: 'expire', data: { bookingId: b.id } })).toBe(true);
      expect(await worker.process({ name: 'expire', data: { bookingId: b.id } })).toBe(false);
      const expired = (await detail(borrower, b.id)).body;
      expect(expired).toMatchObject({ status: 'EXPIRED', expiresAt: null });
      expect(expired.events.at(-1)).toMatchObject({ type: 'EXPIRED', by: 'SYSTEM' });
      for (const u of [borrower, lender]) {
        const n = (await notifications(u)).items[0];
        expect(n.type).toBe('booking.expired');
        expect(n.body).toContain('the lender didn’t reply in time');
      }

      // The sweep catches a held booking whose job was lost; the dates free up.
      const held = (await book(borrower, listingId, 8, 9).expect(201)).body;
      await act(lender, held.id, 'accept').expect(200);
      await prisma.booking.update({
        where: { id: held.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await worker.process({ name: 'sweep-expired', data: {} })).toBeGreaterThanOrEqual(1);
      expect((await detail(borrower, held.id)).body.status).toBe('EXPIRED');
      const q = await http(app)
        .get(`/v1/listings/${listingId}/quote`)
        .query({ startDate: isoDay(8), endDate: isoDay(9) })
        .expect(200);
      expect(q.body.available).toBe(true);
    });
  });

  describe('from a chat offer', () => {
    it('an accepted offer becomes a booking that’s already accepted', async () => {
      const { lender, borrower, listingId } = await pair({ requiredDocs: ['GOVERNMENT_ID'] });
      const c = await http(app)
        .post('/v1/conversations')
        .set(bearer(borrower.accessToken))
        .send({ listingId })
        .expect(200);
      const offer = await http(app)
        .post(`/v1/conversations/${c.body.id}/offers`)
        .set(bearer(borrower.accessToken))
        .send({ startDate: isoDay(10), endDate: isoDay(12), pricePerDayPaise: 10_000 })
        .expect(201);
      await http(app)
        .post(`/v1/offers/${offer.body.offer.id}/accept`)
        .set(bearer(lender.accessToken))
        .expect(200);

      const conversation = await http(app)
        .get(`/v1/conversations/${c.body.id}`)
        .set(bearer(borrower.accessToken))
        .expect(200);
      const bookingId = conversation.body.openBookingId as string;
      const b = (await detail(borrower, bookingId).expect(200)).body;
      expect(b).toMatchObject({
        source: 'OFFER',
        status: 'AWAITING_DOCS',
        pricePerDayPaise: 10_000,
        rentPaise: 30_000,
        totalPaise: 130_000,
        can: { shareDocs: true },
      });
      expect(b.events).toEqual([
        expect.objectContaining({ type: 'ACCEPTED', by: 'LENDER', note: 'Offer agreed in chat' }),
      ]);
      const chat = await http(app)
        .get(`/v1/conversations/${c.body.id}/messages`)
        .set(bearer(borrower.accessToken))
        .expect(200);
      expect(chat.body.items[0].body).toContain('Booking created: waiting for the borrower');

      // A second deal can't start while this booking is in progress.
      const another = await http(app)
        .post(`/v1/conversations/${c.body.id}/offers`)
        .set(bearer(lender.accessToken))
        .send({ startDate: isoDay(20), endDate: isoDay(21), pricePerDayPaise: 12_000 })
        .expect(201);
      const refused = await http(app)
        .post(`/v1/offers/${another.body.offer.id}/accept`)
        .set(bearer(borrower.accessToken))
        .expect(409);
      expect(refused.body.error.code).toBe('BOOKING_OPEN_EXISTS');
      const request = await book(borrower, listingId, 25, 26).expect(409);
      expect(request.body.error.code).toBe('BOOKING_OPEN_EXISTS');
    });
  });

  describe('notifications and live updates', () => {
    it('the bell: list, unread counts, mark read; push when away; socket when open', async () => {
      const { lender, borrower, listingId } = await pair();
      const token = `fcm-${Date.now()}-lender`;
      await http(app)
        .put('/v1/me/devices/push-token')
        .set(bearer(lender.accessToken))
        .send({ token, platform: 'android' })
        .expect(204);

      const b = (await book(borrower, listingId, 8, 9).expect(201)).body;
      await expect.poll(() => push.to(token).length).toBe(1);
      expect(push.to(token)[0]).toMatchObject({
        title: 'New booking request',
        data: { type: 'booking.requested', bookingId: b.id },
      });
      const unread = await http(app)
        .get('/v1/me/unread')
        .set(bearer(lender.accessToken))
        .expect(200);
      expect(unread.body.notifications).toBe(1);
      const list = await notifications(lender);
      expect(list.unread).toBe(1);
      await http(app)
        .post('/v1/me/notifications/read')
        .set(bearer(lender.accessToken))
        .send({})
        .expect(204);
      expect((await notifications(lender)).unread).toBe(0);

      // With the app open: live booking and notification events, and no push.
      const lenderSocket = await connect(lender.accessToken);
      const borrowerSocket = await connect(borrower.accessToken);
      const updated = next<{ id: string; status: string; role: string }>(
        borrowerSocket,
        'booking:updated',
        (p) => p.id === b.id,
      );
      const bell = next<{ type: string }>(borrowerSocket, 'notification:new');
      const lenderSide = next<{ role: string }>(lenderSocket, 'booking:updated');
      await act(lender, b.id, 'accept').expect(200);
      expect(await updated).toMatchObject({ status: 'AWAITING_PAYMENT', role: 'BORROWER' });
      expect((await lenderSide).role).toBe('LENDER');
      expect((await bell).type).toBe('booking.accepted');
      expect(push.sent.filter((p) => p.message.data.bookingId === b.id)).toHaveLength(1);
    });
  });

  describe('guards', () => {
    it('a listing or account with bookings in progress can’t be deleted', async () => {
      const { lender, borrower, listingId } = await pair();
      const b = (await book(borrower, listingId, 8, 9).expect(201)).body;
      const listing = await http(app)
        .delete(`/v1/me/listings/${listingId}`)
        .set(bearer(lender.accessToken))
        .expect(409);
      expect(listing.body.error.code).toBe('LISTING_HAS_OPEN_BOOKINGS');
      const account = await http(app)
        .delete('/v1/me')
        .set(bearer(borrower.accessToken))
        .expect(409);
      expect(account.body.error.code).toBe('ACCOUNT_HAS_OPEN_BOOKINGS');

      await act(borrower, b.id, 'cancel', { reason: 'Changed my mind' }).expect(200);
      await http(app)
        .delete(`/v1/me/listings/${listingId}`)
        .set(bearer(lender.accessToken))
        .expect(204);
    });
  });

  describe('admin', () => {
    it('lists and shows bookings with their timeline; Ops cancels, Support can’t', async () => {
      const { lender, borrower, listingId } = await pair({ requiredDocs: ['GOVERNMENT_ID'] });
      const pan = await addDocument(borrower, 'PAN');
      const b = (await book(borrower, listingId, 6, 7).expect(201)).body;
      const accepted = (await act(lender, b.id, 'accept').expect(200)).body;
      await act(borrower, b.id, 'documents', {
        shares: [{ requiredDocId: accepted.requiredDocs[0].id, userDocumentId: pan }],
      }).expect(200);
      const shareId = (await detail(lender, b.id)).body.sharedDocuments[0].id;
      await http(app)
        .get(`/v1/bookings/${b.id}/documents/${shareId}/view`)
        .set(bearer(lender.accessToken))
        .expect(200);

      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
      const title = (await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).title;

      const open = await http(app)
        .get('/v1/admin/bookings')
        .query({ tab: 'OPEN', q: title })
        .set(bearer(support.accessToken))
        .expect(200);
      expect(open.body.items).toEqual([
        expect.objectContaining({
          id: b.id,
          status: 'AWAITING_DOCS',
          borrower: expect.objectContaining({ name: 'Rahul Sharma' }),
        }),
      ]);
      const byPerson = await http(app)
        .get('/v1/admin/bookings')
        .query({ tab: 'OPEN', q: borrower.phone.slice(-6) })
        .set(bearer(support.accessToken))
        .expect(200);
      expect(byPerson.body.items.map((i: { id: string }) => i.id)).toContain(b.id);

      const shown = await http(app)
        .get(`/v1/admin/bookings/${b.id}`)
        .set(bearer(support.accessToken))
        .expect(200);
      expect(shown.body).toMatchObject({ cancellable: true, lenderCancellations: 0 });
      expect(shown.body.events.map((e: { actorName: string }) => e.actorName)).toEqual([
        'Rahul Sharma',
        'Asha Patil',
        'Rahul Sharma',
      ]);
      expect(shown.body.sharedDocuments[0].views).toEqual([
        expect.objectContaining({ viewerName: 'Asha Patil', viewerType: 'USER' }),
      ]);

      await http(app)
        .post(`/v1/admin/bookings/${b.id}/cancel`)
        .set(bearer(support.accessToken))
        .send({ reason: 'Suspicious' })
        .expect(403);
      const cancelled = await http(app)
        .post(`/v1/admin/bookings/${b.id}/cancel`)
        .set(bearer(ops.accessToken))
        .send({ reason: 'Reported as a scam' })
        .expect(200);
      expect(cancelled.body).toMatchObject({
        status: 'CANCELLED',
        cancelledBy: 'ADMIN',
        cancellable: false,
      });
      expect(cancelled.body.events.at(-1)).toMatchObject({
        type: 'CANCELLED',
        by: 'ADMIN',
        actorName: 'Test OPS',
        note: 'Reported as a scam',
      });
      for (const u of [borrower, lender]) {
        expect((await notifications(u)).items[0].body).toContain('Sajha cancelled');
      }
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'admin.booking.cancel', targetId: b.id },
      });
      expect(audit?.metadata).toMatchObject({
        reason: 'Reported as a scam',
        from: 'AWAITING_DOCS',
      });
      const closed = await http(app)
        .get('/v1/admin/bookings?tab=CLOSED')
        .set(bearer(ops.accessToken))
        .expect(200);
      expect(closed.body.items.map((i: { id: string }) => i.id)).toContain(b.id);
    });
  });
});
