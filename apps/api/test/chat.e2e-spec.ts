import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { PrismaService } from '../src/prisma/prisma.service.js';
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
import { isoDay, liveListing, utcDay, verifiedUser } from './helpers/market.js';
import { photo, upload } from './helpers/uploads.js';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
let clientSeq = 0;
const clientId = () => `c-${Date.now()}-${++clientSeq}`;

describe('Chat, offers & safety (e2e)', () => {
  let app: INestApplication;
  let sms: InMemorySmsProvider;
  let push: InMemoryPushProvider;
  let prisma: PrismaService;
  let port: number;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ({ app, sms, push } = await createTestApp());
    prisma = app.get(PrismaService);
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  // OTP and chat limits are per IP / user in Redis; start each test clean.
  beforeEach(() => flushRedis(app));

  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });

  afterAll(async () => {
    await app.close();
  });

  /** A lender with a live listing and a borrower, both verified. */
  async function pair(listing: Parameters<typeof liveListing>[2] = {}) {
    const lender = await verifiedUser(app, sms, 'Asha Patil');
    const borrower = await verifiedUser(app, sms, 'Rahul Sharma');
    const listingId = await liveListing(app, lender.userId, listing);
    return { lender, borrower, listingId };
  }

  async function start(borrower: UserSession, listingId: string) {
    const res = await http(app)
      .post('/v1/conversations')
      .set(bearer(borrower.accessToken))
      .send({ listingId })
      .expect(200);
    return res.body as { id: string; [k: string]: unknown };
  }

  function say(user: UserSession, conversationId: string, body: string, id = clientId()) {
    return http(app)
      .post(`/v1/conversations/${conversationId}/messages`)
      .set(bearer(user.accessToken))
      .send({ type: 'TEXT', body, clientId: id });
  }

  function messages(user: UserSession, conversationId: string, query: object = {}) {
    return http(app)
      .get(`/v1/conversations/${conversationId}/messages`)
      .query(query)
      .set(bearer(user.accessToken));
  }

  function offer(
    user: UserSession,
    conversationId: string,
    from: number,
    to: number,
    price: number,
  ) {
    return http(app)
      .post(`/v1/conversations/${conversationId}/offers`)
      .set(bearer(user.accessToken))
      .send({ startDate: isoDay(from), endDate: isoDay(to), pricePerDayPaise: price });
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

  function next<T>(
    socket: Socket,
    event: string,
    match: (p: T) => boolean = () => true,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
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

  describe('starting a chat', () => {
    it('needs a verified email, someone else’s live listing, and is idempotent', async () => {
      const { lender, borrower, listingId } = await pair();
      const unverified = await loginUser(app, sms);
      const denied = await http(app)
        .post('/v1/conversations')
        .set(bearer(unverified.accessToken))
        .send({ listingId })
        .expect(403);
      expect(denied.body.error).toMatchObject({
        code: 'VERIFICATION_REQUIRED',
        details: { missing: ['email'] },
      });

      const own = await http(app)
        .post('/v1/conversations')
        .set(bearer(lender.accessToken))
        .send({ listingId })
        .expect(400);
      expect(own.body.error.code).toBe('CONVERSATION_NOT_ALLOWED');

      const paused = await liveListing(app, lender.userId, { status: 'PAUSED' });
      await http(app)
        .post('/v1/conversations')
        .set(bearer(borrower.accessToken))
        .send({ listingId: paused })
        .expect(404);

      const first = await start(borrower, listingId);
      const again = await start(borrower, listingId);
      expect(again.id).toBe(first.id);
      expect(first).toMatchObject({
        role: 'BORROWER',
        other: { id: lender.userId, name: 'Asha Patil' },
        listing: { id: listingId, title: 'Quechua trekking tent', status: 'LIVE' },
        unreadCount: 0,
        canMessage: true,
        pendingOffer: null,
        acceptedOffer: null,
      });

      // The lender's inbox only shows it once the borrower writes.
      const before = await http(app)
        .get('/v1/conversations')
        .set(bearer(lender.accessToken))
        .expect(200);
      expect(before.body.items.map((c: { id: string }) => c.id)).not.toContain(first.id);
      await say(borrower, first.id, 'Hi! Is the tent free next week?').expect(201);
      const after = await http(app)
        .get('/v1/conversations')
        .set(bearer(lender.accessToken))
        .expect(200);
      expect(after.body.items[0]).toMatchObject({ id: first.id, role: 'LENDER', unreadCount: 1 });
    });

    it('stays usable when the listing is paused later, but others can’t see it', async () => {
      const { lender, borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      await prisma.listing.update({ where: { id: listingId }, data: { status: 'PAUSED' } });
      await say(borrower, c.id, 'Still around?').expect(201);
      const stranger = await verifiedUser(app, sms);
      await messages(stranger, c.id).expect(404);
      await say(stranger, c.id, 'hello').expect(404);
      await http(app).get(`/v1/conversations/${c.id}`).set(bearer(lender.accessToken)).expect(200);
    });
  });

  describe('messages', () => {
    it('hides contact details from the other person only', async () => {
      const { lender, borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      const sent = await say(borrower, c.id, 'Call me on 98765 43210 or rahul@gmail.com').expect(
        201,
      );
      expect(sent.body).toMatchObject({
        mine: true,
        type: 'TEXT',
        body: 'Call me on 98765 43210 or rahul@gmail.com',
        masked: true,
      });

      const theirs = await messages(lender, c.id).expect(200);
      expect(theirs.body.items[0]).toMatchObject({
        mine: false,
        body: 'Call me on ••• or •••',
        masked: true,
        clientId: null,
      });
      // The inbox preview is masked for both.
      const inbox = await http(app)
        .get('/v1/conversations')
        .set(bearer(borrower.accessToken))
        .expect(200);
      expect(inbox.body.items.find((i: { id: string }) => i.id === c.id).lastMessagePreview).toBe(
        'Call me on ••• or •••',
      );
      // The original is kept for moderation.
      const row = await prisma.message.findUniqueOrThrow({ where: { id: sent.body.id } });
      expect(row.body).toContain('98765 43210');
    });

    it('stores a retried send once, pages back, and tracks what was read', async () => {
      const { lender, borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      const id = clientId();
      const a = await say(borrower, c.id, 'First', id).expect(201);
      const b = await say(borrower, c.id, 'First', id).expect(201);
      expect(b.body.id).toBe(a.body.id);
      for (const text of ['Second', 'Third']) await say(borrower, c.id, text).expect(201);

      const page1 = await messages(lender, c.id, { limit: 2 }).expect(200);
      expect(page1.body.items.map((m: { body: string }) => m.body)).toEqual(['Third', 'Second']);
      const page2 = await messages(lender, c.id, {
        limit: 2,
        before: page1.body.nextCursor,
      }).expect(200);
      expect(page2.body.items.map((m: { body: string }) => m.body)).toEqual(['First']);
      expect(page2.body.nextCursor).toBeNull();

      expect((await http(app).get('/v1/me/unread').set(bearer(lender.accessToken))).body).toEqual({
        conversations: 1,
        messages: 3,
      });
      await http(app)
        .post(`/v1/conversations/${c.id}/read`)
        .set(bearer(lender.accessToken))
        .send({ upTo: page1.body.items[0].id })
        .expect(204);
      expect((await http(app).get('/v1/me/unread').set(bearer(lender.accessToken))).body).toEqual({
        conversations: 0,
        messages: 0,
      });
      const mine = await messages(borrower, c.id).expect(200);
      expect(mine.body.items.every((m: { readAt: string | null }) => m.readAt !== null)).toBe(true);
    });

    it('sends photos as private, short-lived links', async () => {
      const { lender, borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      const key = await upload(app, borrower.accessToken, 'CHAT_IMAGE', await photo());
      const sent = await http(app)
        .post(`/v1/conversations/${c.id}/messages`)
        .set(bearer(borrower.accessToken))
        .send({ type: 'IMAGE', key, clientId: clientId() })
        .expect(201);
      expect(sent.body.type).toBe('IMAGE');
      const seen = (await messages(lender, c.id).expect(200)).body.items[0];
      expect(seen.imageUrl).toContain('X-Amz-Signature');
      expect(seen.imageUrl).toContain('sajha-private-docs');
      const image = await fetch(seen.thumbUrl);
      expect(image.status).toBe(200);
      expect(image.headers.get('content-type')).toBe('image/webp');
      // A used upload can't be sent again.
      await http(app)
        .post(`/v1/conversations/${c.id}/messages`)
        .set(bearer(borrower.accessToken))
        .send({ type: 'IMAGE', key, clientId: clientId() })
        .expect(400);
    });

    it('rejects empty text and rate-limits floods', async () => {
      const { borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      await say(borrower, c.id, '   ').expect(400);
      for (let i = 0; i < 30; i++) await say(borrower, c.id, `msg ${i}`).expect(201);
      const limited = await say(borrower, c.id, 'one too many').expect(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('offers', () => {
    it('offer → counter → accept locks the deal', async () => {
      const { lender, borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      const first = await offer(borrower, c.id, 5, 8, 12_000).expect(201);
      expect(first.body).toMatchObject({ type: 'OFFER', mine: true });
      expect(first.body.offer).toMatchObject({
        status: 'PENDING',
        days: 4,
        pricePerDayPaise: 12_000,
        rentPaise: 48_000,
        depositPaise: 100_000,
        totalPaise: 148_000,
        startDate: isoDay(5),
        endDate: isoDay(8),
      });

      // You can't answer your own offer.
      const own = await http(app)
        .post(`/v1/offers/${first.body.offer.id}/accept`)
        .set(bearer(borrower.accessToken))
        .expect(403);
      expect(own.body.error.code).toBe('OFFER_OWN');

      const counter = await http(app)
        .post(`/v1/offers/${first.body.offer.id}/counter`)
        .set(bearer(lender.accessToken))
        .send({ startDate: isoDay(5), endDate: isoDay(8), pricePerDayPaise: 13_500 })
        .expect(201);
      expect(counter.body.offer).toMatchObject({
        status: 'PENDING',
        parentOfferId: first.body.offer.id,
        mine: true,
      });

      // The first one was answered.
      const stale = await http(app)
        .post(`/v1/offers/${first.body.offer.id}/accept`)
        .set(bearer(lender.accessToken))
        .expect(409);
      expect(stale.body.error).toMatchObject({
        code: 'OFFER_NOT_PENDING',
        details: { status: 'COUNTERED' },
      });

      const accepted = await http(app)
        .post(`/v1/offers/${counter.body.offer.id}/accept`)
        .set(bearer(borrower.accessToken))
        .expect(200);
      expect(accepted.body).toMatchObject({ status: 'ACCEPTED', mine: false, rentPaise: 54_000 });

      const conv = await http(app)
        .get(`/v1/conversations/${c.id}`)
        .set(bearer(lender.accessToken))
        .expect(200);
      expect(conv.body.pendingOffer).toBeNull();
      expect(conv.body.acceptedOffer).toMatchObject({ id: counter.body.offer.id, mine: true });
      const latest = (await messages(lender, c.id).expect(200)).body.items[0];
      expect(latest).toMatchObject({ type: 'SYSTEM' });
      expect(latest.body).toMatch(/^Offer accepted: .* at ₹135\/day/);

      // A later deal replaces this one.
      const again = await offer(lender, c.id, 10, 11, 14_000).expect(201);
      await http(app)
        .post(`/v1/offers/${again.body.offer.id}/accept`)
        .set(bearer(borrower.accessToken))
        .expect(200);
      const old = await prisma.offer.findUniqueOrThrow({ where: { id: counter.body.offer.id } });
      expect(old.status).toBe('SUPERSEDED');
    });

    it('checks the listing’s rules for the dates, and can be declined', async () => {
      const { lender, borrower, listingId } = await pair({
        minDays: 2,
        blocks: [{ startsOn: utcDay(20), endsOn: utcDay(22) }],
      });
      const c = await start(borrower, listingId);
      const blocked = await offer(borrower, c.id, 19, 21, 12_000).expect(409);
      expect(blocked.body.error).toMatchObject({
        code: 'OFFER_DATES_UNAVAILABLE',
        details: { reason: 'BLOCKED' },
      });
      const short = await offer(borrower, c.id, 5, 5, 12_000).expect(409);
      expect(short.body.error.details.reason).toBe('TOO_SHORT');
      await offer(borrower, c.id, -1, 2, 12_000).expect(400); // in the past
      await offer(borrower, c.id, 5, 6, 5).expect(400); // below the minimum price

      const made = await offer(borrower, c.id, 5, 6, 12_000).expect(201);
      const declined = await http(app)
        .post(`/v1/offers/${made.body.offer.id}/decline`)
        .set(bearer(lender.accessToken))
        .expect(200);
      expect(declined.body.status).toBe('DECLINED');
      const latest = (await messages(borrower, c.id).expect(200)).body.items[0];
      expect(latest).toMatchObject({ type: 'SYSTEM', body: 'Offer declined' });
    });

    it('expires unanswered offers and refuses deals on paused listings', async () => {
      const { lender, borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      const made = await offer(borrower, c.id, 5, 6, 12_000).expect(201);
      await prisma.offer.update({
        where: { id: made.body.offer.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      // Shown as expired straight away, before anyone acts on it.
      const shown = (await messages(lender, c.id).expect(200)).body.items[0];
      expect(shown.offer.status).toBe('EXPIRED');
      const expired = await http(app)
        .post(`/v1/offers/${made.body.offer.id}/accept`)
        .set(bearer(lender.accessToken))
        .expect(409);
      expect(expired.body.error.code).toBe('OFFER_EXPIRED');
      expect(
        (await prisma.offer.findUniqueOrThrow({ where: { id: made.body.offer.id } })).status,
      ).toBe('EXPIRED');

      const fresh = await offer(borrower, c.id, 5, 6, 12_000).expect(201);
      await prisma.listing.update({ where: { id: listingId }, data: { status: 'PAUSED' } });
      const paused = await http(app)
        .post(`/v1/offers/${fresh.body.offer.id}/accept`)
        .set(bearer(lender.accessToken))
        .expect(409);
      expect(paused.body.error).toMatchObject({
        code: 'OFFER_DATES_UNAVAILABLE',
        details: { reason: 'NOT_LIVE' },
      });
    });

    it('keeps one open offer per chat', async () => {
      const { lender, borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      const a = await offer(borrower, c.id, 5, 6, 12_000).expect(201);
      const b = await offer(borrower, c.id, 5, 7, 11_000).expect(201);
      expect(
        (await prisma.offer.findUniqueOrThrow({ where: { id: a.body.offer.id } })).status,
      ).toBe('COUNTERED');
      const conv = await http(app)
        .get(`/v1/conversations/${c.id}`)
        .set(bearer(lender.accessToken))
        .expect(200);
      expect(conv.body.pendingOffer.id).toBe(b.body.offer.id);
    });
  });

  describe('blocks and reports', () => {
    it('blocking stops messages and offers both ways until unblocked', async () => {
      const { lender, borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      await say(borrower, c.id, 'Hello').expect(201);
      await http(app)
        .put(`/v1/me/blocks/${borrower.userId}`)
        .set(bearer(lender.accessToken))
        .expect(204);
      await http(app)
        .put(`/v1/me/blocks/${borrower.userId}`)
        .set(bearer(lender.accessToken))
        .expect(204);

      expect((await say(borrower, c.id, 'Hello?').expect(403)).body.error.code).toBe(
        'USER_BLOCKED',
      );
      expect((await say(lender, c.id, 'Bye').expect(403)).body.error.code).toBe('USER_BLOCKED');
      await offer(borrower, c.id, 5, 6, 12_000).expect(403);
      const seenByLender = await http(app)
        .get(`/v1/conversations/${c.id}`)
        .set(bearer(lender.accessToken))
        .expect(200);
      expect(seenByLender.body).toMatchObject({ blockedByMe: true, canMessage: false });
      const seenByBorrower = await http(app)
        .get(`/v1/conversations/${c.id}`)
        .set(bearer(borrower.accessToken))
        .expect(200);
      expect(seenByBorrower.body).toMatchObject({ blockedByMe: false, canMessage: false });
      // Blocked people can't open new chats with each other either.
      const other = await liveListing(app, lender.userId, { title: 'Rucksack' });
      await http(app)
        .post('/v1/conversations')
        .set(bearer(borrower.accessToken))
        .send({ listingId: other })
        .expect(403);

      const list = await http(app).get('/v1/me/blocks').set(bearer(lender.accessToken)).expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({
          user: expect.objectContaining({ id: borrower.userId, name: 'Rahul Sharma' }),
        }),
      ]);
      await http(app)
        .put(`/v1/me/blocks/${lender.userId}`)
        .set(bearer(lender.accessToken))
        .expect(400);

      await http(app)
        .delete(`/v1/me/blocks/${borrower.userId}`)
        .set(bearer(lender.accessToken))
        .expect(204);
      await say(borrower, c.id, 'Thanks').expect(201);
    });

    it('reports: from the chat, once, never your own; admins review them', async () => {
      const { lender, borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      const msg = await say(lender, c.id, 'Pay me on asha@okaxis, cheaper').expect(201);

      const report = await http(app)
        .post('/v1/reports')
        .set(bearer(borrower.accessToken))
        .send({
          targetType: 'MESSAGE',
          targetId: msg.body.id,
          reason: 'OFF_PLATFORM_PAYMENT',
          note: 'Asked for UPI',
        })
        .expect(201);
      expect(report.body.status).toBe('OPEN');
      const dup = await http(app)
        .post('/v1/reports')
        .set(bearer(borrower.accessToken))
        .send({ targetType: 'MESSAGE', targetId: msg.body.id, reason: 'SPAM' })
        .expect(409);
      expect(dup.body.error.code).toBe('REPORT_DUPLICATE');
      await http(app)
        .post('/v1/reports')
        .set(bearer(lender.accessToken))
        .send({ targetType: 'MESSAGE', targetId: msg.body.id, reason: 'SPAM' })
        .expect(400); // own message
      const stranger = await verifiedUser(app, sms);
      await http(app)
        .post('/v1/reports')
        .set(bearer(stranger.accessToken))
        .send({ targetType: 'MESSAGE', targetId: msg.body.id, reason: 'SPAM' })
        .expect(404); // not their chat
      await http(app)
        .post('/v1/reports')
        .set(bearer(borrower.accessToken))
        .send({ targetType: 'USER', targetId: borrower.userId, reason: 'SPAM' })
        .expect(400);
      await http(app)
        .post('/v1/reports')
        .set(bearer(borrower.accessToken))
        .send({ targetType: 'LISTING', targetId: listingId, reason: 'SCAM' })
        .expect(201);

      // Support can look; only ops can close.
      const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      const detail = await http(app)
        .get(`/v1/admin/reports/${report.body.id}`)
        .set(bearer(support.accessToken))
        .expect(200);
      expect(detail.body).toMatchObject({
        reason: 'OFF_PLATFORM_PAYMENT',
        note: 'Asked for UPI',
        reporter: { id: borrower.userId },
        conversationId: c.id,
        target: {
          type: 'MESSAGE',
          label: 'Pay me on •••, cheaper',
          originalText: 'Pay me on asha@okaxis, cheaper',
          ownerId: lender.userId,
        },
        openReportsOnTarget: 1,
      });
      const queue = await http(app)
        .get('/v1/admin/reports')
        .set(bearer(support.accessToken))
        .expect(200);
      expect(queue.body.items.map((r: { id: string }) => r.id)).toContain(report.body.id);

      await http(app)
        .post(`/v1/admin/reports/${report.body.id}/resolve`)
        .set(bearer(support.accessToken))
        .send({ outcome: 'ACTIONED', note: 'Warned the lender' })
        .expect(403);
      const resolved = await http(app)
        .post(`/v1/admin/reports/${report.body.id}/resolve`)
        .set(bearer(ops.accessToken))
        .send({ outcome: 'ACTIONED', note: 'Warned the lender' })
        .expect(200);
      expect(resolved.body).toMatchObject({
        status: 'ACTIONED',
        resolutionNote: 'Warned the lender',
      });
      await http(app)
        .post(`/v1/admin/reports/${report.body.id}/resolve`)
        .set(bearer(ops.accessToken))
        .send({ outcome: 'DISMISSED', note: 'again' })
        .expect(409);
      const actioned = await http(app)
        .get('/v1/admin/reports')
        .query({ status: 'ACTIONED' })
        .set(bearer(ops.accessToken))
        .expect(200);
      expect(actioned.body.items[0].id).toBe(report.body.id);

      // The transcript shows what was typed, and every look is audited.
      const transcript = await http(app)
        .get(`/v1/admin/conversations/${c.id}/messages`)
        .set(bearer(support.accessToken))
        .expect(200);
      expect(transcript.body).toMatchObject({
        conversationId: c.id,
        listingTitle: 'Quechua trekking tent',
        borrower: { id: borrower.userId },
        lender: { id: lender.userId },
      });
      expect(transcript.body.messages[0]).toMatchObject({
        body: 'Pay me on asha@okaxis, cheaper',
        masked: true,
      });
      const audit = await prisma.auditLog.findMany({
        where: { action: 'admin.conversation.view', targetId: c.id },
      });
      expect(audit).toHaveLength(1);
      expect(
        await prisma.auditLog.count({
          where: { action: 'admin.report.action', targetId: report.body.id },
        }),
      ).toBe(1);
      // App users can't reach admin routes.
      await http(app).get('/v1/admin/reports').set(bearer(borrower.accessToken)).expect(401);
    });
  });

  describe('push notifications', () => {
    it('pushes to away devices with masked text, and drops dead or signed-out tokens', async () => {
      const { lender, borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      const token = `fcm-${clientId()}-lender-phone`;
      const dead = `fcm-${clientId()}-old-phone`;
      await http(app)
        .put('/v1/me/devices/push-token')
        .set(bearer(lender.accessToken))
        .send({ token, platform: 'android' })
        .expect(204);
      const secondLogin = await loginUser(app, sms, lender.phone);
      await http(app)
        .put('/v1/me/devices/push-token')
        .set(bearer(secondLogin.accessToken))
        .send({ token: dead, platform: 'ios' })
        .expect(204);
      push.invalid.add(dead);

      await say(borrower, c.id, 'Is 98765 43210 ok to call?').expect(201);
      await expect.poll(() => push.to(token).length).toBe(1);
      expect(push.to(token)[0]).toEqual({
        title: 'Rahul',
        body: 'Is ••• ok to call?',
        data: expect.objectContaining({ type: 'chat.message', conversationId: c.id }),
      });
      await expect.poll(() => prisma.deviceToken.count({ where: { token: dead } })).toBe(0);

      // Signing out that device stops its pushes.
      await http(app)
        .delete('/v1/me/devices/push-token')
        .set(bearer(lender.accessToken))
        .expect(204);
      await say(borrower, c.id, 'Hello again').expect(201);
      await new Promise((r) => setTimeout(r, 200));
      expect(push.to(token)).toHaveLength(1);
    });

    it('account deletion removes the user’s tokens', async () => {
      const user = await verifiedUser(app, sms);
      await http(app)
        .put('/v1/me/devices/push-token')
        .set(bearer(user.accessToken))
        .send({ token: `fcm-${clientId()}-deleted`, platform: 'android' })
        .expect(204);
      await http(app).delete('/v1/me').set(bearer(user.accessToken)).expect(202);
      expect(await prisma.deviceToken.count({ where: { userId: user.userId } })).toBe(0);
    });
  });

  describe('live updates (socket)', () => {
    it('refuses a bad token with the error code', async () => {
      await expect(connect('not-a-token')).rejects.toMatchObject({ message: 'TOKEN_INVALID' });
    });

    it('delivers each person’s view of a message, typing and read receipts, and skips push while online', async () => {
      const { lender, borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      const token = `fcm-${clientId()}-online`;
      await http(app)
        .put('/v1/me/devices/push-token')
        .set(bearer(lender.accessToken))
        .send({ token, platform: 'android' })
        .expect(204);
      const lenderSocket = await connect(lender.accessToken);
      const borrowerSocket = await connect(borrower.accessToken);

      const lenderGets = next<{ body: string; mine: boolean }>(lenderSocket, 'message:new');
      const borrowerGets = next<{ body: string; mine: boolean }>(borrowerSocket, 'message:new');
      await say(borrower, c.id, 'Call 9876543210').expect(201);
      expect(await lenderGets).toMatchObject({ body: 'Call •••', mine: false, masked: true });
      expect(await borrowerGets).toMatchObject({ body: 'Call 9876543210', mine: true });
      await new Promise((r) => setTimeout(r, 200));
      expect(push.to(token)).toHaveLength(0);

      const typing = next<{ conversationId: string; userId: string }>(lenderSocket, 'typing');
      borrowerSocket.emit('typing', { conversationId: c.id });
      expect(await typing).toEqual({ conversationId: c.id, userId: borrower.userId });

      const read = next<{ conversationId: string; readerId: string }>(
        borrowerSocket,
        'message:read',
      );
      const latest = (await messages(lender, c.id).expect(200)).body.items[0];
      await http(app)
        .post(`/v1/conversations/${c.id}/read`)
        .set(bearer(lender.accessToken))
        .send({ upTo: latest.id })
        .expect(204);
      expect(await read).toMatchObject({
        conversationId: c.id,
        readerId: lender.userId,
        upTo: latest.id,
      });
    });

    it('announces offer changes to both sides', async () => {
      const { lender, borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      const made = await offer(borrower, c.id, 5, 6, 12_000).expect(201);
      const borrowerSocket = await connect(borrower.accessToken);
      const updated = next<{ id: string; status: string; mine: boolean }>(
        borrowerSocket,
        'offer:updated',
        (o) => o.id === made.body.offer.id,
      );
      await http(app)
        .post(`/v1/offers/${made.body.offer.id}/decline`)
        .set(bearer(lender.accessToken))
        .expect(200);
      expect(await updated).toMatchObject({ status: 'DECLINED', mine: true });
    });

    it('ignores typing for chats you are not in', async () => {
      const { borrower, listingId } = await pair();
      const c = await start(borrower, listingId);
      const stranger = await verifiedUser(app, sms);
      const strangerSocket = await connect(stranger.accessToken);
      const borrowerSocket = await connect(borrower.accessToken);
      let relayed = false;
      borrowerSocket.on('typing', () => (relayed = true));
      strangerSocket.emit('typing', { conversationId: c.id });
      await new Promise((r) => setTimeout(r, 300));
      expect(relayed).toBe(false);
    });
  });
});
