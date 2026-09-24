import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import {
  createAdmin,
  flushRedis,
  http,
  loginAdmin,
  loginUser,
  uniqueEmail,
  type UserSession,
} from './helpers/auth.js';
import type { InMemorySmsProvider } from './helpers/in-memory-sms.js';
import { photo, upload } from './helpers/uploads.js';

describe('Listings & categories (e2e)', () => {
  let app: INestApplication;
  let sms: InMemorySmsProvider;
  let prisma: PrismaService;
  let categoryId: string;
  let ops: { accessToken: string };
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const isoDay = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const draft = {
    title: 'Quechua 2-person trekking tent',
    description: 'Waterproof tent, used on three treks. Pegs and carry bag included.',
    condition: 'GOOD',
    brand: 'Decathlon',
    pricePerDayPaise: 15_000,
    weeklyDiscountPct: 10,
    depositPaise: 100_000,
    minDays: 2,
    maxDays: 14,
    advanceNoticeDays: 1,
    lat: 18.507412,
    lng: 73.807739,
    areaLabel: 'Kothrud, Pune',
    exactAddress: 'Flat 4B, Sai Residency, Paud Road',
  };

  /** A user who can list: phone verified by login, email verified directly. */
  async function lender(): Promise<UserSession> {
    const user = await loginUser(app, sms);
    await prisma.user.update({
      where: { id: user.userId },
      data: { email: uniqueEmail('lender'), emailVerifiedAt: new Date(), name: 'Aman Lender' },
    });
    return user;
  }

  /** Draft with one photo, ready to publish. */
  async function readyListing(user: UserSession, body: object = {}) {
    const created = await http(app)
      .post('/v1/me/listings')
      .set(bearer(user.accessToken))
      .send({ ...draft, categoryId, ...body })
      .expect(201);
    const key = await upload(app, user.accessToken, 'LISTING_PHOTO', await photo(2400, 1600));
    await http(app)
      .post(`/v1/me/listings/${created.body.id}/photos`)
      .set(bearer(user.accessToken))
      .send({ key })
      .expect(201);
    return created.body.id as string;
  }

  const publish = (user: UserSession, id: string) =>
    http(app).post(`/v1/me/listings/${id}/publish`).set(bearer(user.accessToken));

  beforeAll(async () => {
    ({ app, sms } = await createTestApp());
    prisma = app.get(PrismaService);
    ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
  });

  beforeEach(async () => {
    await flushRedis(app);
    const res = await http(app).get('/v1/categories').expect(200);
    categoryId = res.body[0].id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('categories', () => {
    it('serves the launch categories publicly, in order', async () => {
      const res = await http(app).get('/v1/categories').expect(200);
      expect(res.body.map((c: { slug: string }) => c.slug)).toEqual(
        expect.arrayContaining(['trekking-outdoor', 'cameras-electronics', 'costumes-ethnic']),
      );
      expect(res.body[0]).toEqual({
        id: expect.any(String),
        name: 'Trekking & outdoor gear',
        slug: 'trekking-outdoor',
        icon: 'hiking',
      });
    });

    it('lets Ops create, rename, hide and reorder; slugs are unique; Support is refused', async () => {
      const created = await http(app)
        .post('/v1/admin/categories')
        .set(bearer(ops.accessToken))
        .send({ name: 'Musical instruments', slug: 'musical-instruments', icon: 'music_note' })
        .expect(201);
      expect(created.body).toMatchObject({ isActive: true, listingCount: 0 });

      const dup = await http(app)
        .post('/v1/admin/categories')
        .set(bearer(ops.accessToken))
        .send({ name: 'Music', slug: 'musical-instruments', icon: 'music_note' })
        .expect(409);
      expect(dup.body.error.code).toBe('CATEGORY_SLUG_TAKEN');
      await http(app)
        .post('/v1/admin/categories')
        .set(bearer(ops.accessToken))
        .send({ name: 'Bad', slug: 'Not A Slug', icon: 'x' })
        .expect(400);

      const all = await http(app).get('/v1/admin/categories').set(bearer(ops.accessToken));
      const ids: string[] = all.body.map((c: { id: string }) => c.id);
      const reordered = [created.body.id, ...ids.filter((id) => id !== created.body.id)];
      await http(app)
        .put('/v1/admin/categories/order')
        .set(bearer(ops.accessToken))
        .send({ ids: reordered })
        .expect(200);
      expect((await http(app).get('/v1/categories')).body[0].slug).toBe('musical-instruments');
      await http(app)
        .put('/v1/admin/categories/order')
        .set(bearer(ops.accessToken))
        .send({ ids: reordered.slice(1) })
        .expect(400);

      await http(app)
        .patch(`/v1/admin/categories/${created.body.id}`)
        .set(bearer(ops.accessToken))
        .send({ isActive: false })
        .expect(200);
      const publicSlugs = (await http(app).get('/v1/categories')).body.map(
        (c: { slug: string }) => c.slug,
      );
      expect(publicSlugs).not.toContain('musical-instruments');

      // Listings can't use a hidden category.
      const user = await lender();
      const res = await http(app)
        .post('/v1/me/listings')
        .set(bearer(user.accessToken))
        .send({ ...draft, categoryId: created.body.id })
        .expect(400);
      expect(res.body.error.code).toBe('CATEGORY_INACTIVE');

      const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
      await http(app).get('/v1/admin/categories').set(bearer(support.accessToken)).expect(403);
      await http(app)
        .patch(`/v1/admin/categories/${created.body.id}`)
        .set(bearer(ops.accessToken))
        .send({ isActive: true })
        .expect(200);
    });
  });

  describe('lender', () => {
    it('needs a verified email to list', async () => {
      const user = await loginUser(app, sms);
      const res = await http(app)
        .post('/v1/me/listings')
        .set(bearer(user.accessToken))
        .send({ ...draft, categoryId })
        .expect(403);
      expect(res.body.error).toMatchObject({
        code: 'VERIFICATION_REQUIRED',
        details: { missing: ['email'] },
      });
    });

    it('validates prices, deposit and rental days', async () => {
      const user = await lender();
      const send = (body: object) =>
        http(app)
          .post('/v1/me/listings')
          .set(bearer(user.accessToken))
          .send({ ...draft, categoryId, ...body });
      expect(
        Object.keys((await send({ pricePerDayPaise: 500 }).expect(400)).body.error.details),
      ).toContain('pricePerDayPaise');
      await send({ depositPaise: 6_000_000 }).expect(400);
      await send({ weeklyDiscountPct: 60 }).expect(400);
      await send({ minDays: 10, maxDays: 5 }).expect(400);
      await send({ lat: 95 }).expect(400);
      await send({ title: 'Tent' }).expect(400);
    });

    it('creates a draft, keeps the address encrypted, and manages photos, dates and documents', async () => {
      const user = await lender();
      const created = await http(app)
        .post('/v1/me/listings')
        .set(bearer(user.accessToken))
        .send({ ...draft, categoryId })
        .expect(201);
      const id = created.body.id;
      expect(created.body).toMatchObject({
        status: 'DRAFT',
        exactAddress: draft.exactAddress,
        lat: draft.lat,
        lng: draft.lng,
        category: { id: categoryId },
        photos: [],
      });

      // At rest: ciphertext, and the geography point follows lat/lng.
      const [row] = await prisma.$queryRaw<{ enc: string; point: string }[]>`
        SELECT exact_address_enc AS enc, ST_AsText(location::geometry) AS point
        FROM listings WHERE id = ${id}::uuid`;
      expect(row.enc).not.toContain('Sai Residency');
      expect(row.point).toBe(`POINT(${draft.lng} ${draft.lat})`);

      // Publishing needs a photo.
      const incomplete = await publish(user, id).expect(400);
      expect(incomplete.body.error).toMatchObject({
        code: 'LISTING_INCOMPLETE',
        details: { missing: ['photo'] },
      });

      // Photos: processed into gallery + thumbnail WebPs, reorderable, deletable.
      const keys = await Promise.all(
        [photo(2400, 1600, '#111111'), photo(1200, 1200, '#222222')].map(async (p) =>
          upload(app, user.accessToken, 'LISTING_PHOTO', await p),
        ),
      );
      for (const key of keys) {
        await http(app)
          .post(`/v1/me/listings/${id}/photos`)
          .set(bearer(user.accessToken))
          .send({ key })
          .expect(201);
      }
      const mine = await http(app).get(`/v1/me/listings/${id}`).set(bearer(user.accessToken));
      expect(mine.body.photos).toHaveLength(2);
      const [first, second] = mine.body.photos;
      expect(first).toMatchObject({ width: 1600, height: 1067 });
      const thumb = await fetch(first.thumbUrl);
      expect(thumb.headers.get('content-type')).toBe('image/webp');
      expect((await sharp(Buffer.from(await thumb.arrayBuffer())).metadata()).width).toBe(480);

      const reordered = await http(app)
        .put(`/v1/me/listings/${id}/photos/order`)
        .set(bearer(user.accessToken))
        .send({ ids: [second.id, first.id] })
        .expect(200);
      expect(reordered.body.photos.map((p: { id: string }) => p.id)).toEqual([second.id, first.id]);
      await http(app)
        .put(`/v1/me/listings/${id}/photos/order`)
        .set(bearer(user.accessToken))
        .send({ ids: [second.id] })
        .expect(400);

      await http(app)
        .delete(`/v1/me/listings/${id}/photos/${second.id}`)
        .set(bearer(user.accessToken))
        .expect(200);
      expect((await fetch(second.url)).status).toBe(404);

      // Blocked dates: inclusive ranges in the next year, never in the past.
      const blocks = await http(app)
        .put(`/v1/me/listings/${id}/blocks`)
        .set(bearer(user.accessToken))
        .send({ ranges: [{ startsOn: isoDay(10), endsOn: isoDay(12) }] })
        .expect(200);
      expect(blocks.body.blocks).toEqual([{ startsOn: isoDay(10), endsOn: isoDay(12) }]);
      for (const bad of [
        { startsOn: isoDay(5), endsOn: isoDay(3) },
        { startsOn: isoDay(-5), endsOn: isoDay(-2) },
        { startsOn: isoDay(300), endsOn: isoDay(400) },
      ]) {
        await http(app)
          .put(`/v1/me/listings/${id}/blocks`)
          .set(bearer(user.accessToken))
          .send({ ranges: [bad] })
          .expect(400);
      }

      // Required documents: OTHER needs a note; each type once.
      await http(app)
        .put(`/v1/me/listings/${id}/required-docs`)
        .set(bearer(user.accessToken))
        .send({ items: [{ docType: 'OTHER' }] })
        .expect(400);
      await http(app)
        .put(`/v1/me/listings/${id}/required-docs`)
        .set(bearer(user.accessToken))
        .send({ items: [{ docType: 'GOVERNMENT_ID' }, { docType: 'GOVERNMENT_ID' }] })
        .expect(400);
      const docs = await http(app)
        .put(`/v1/me/listings/${id}/required-docs`)
        .set(bearer(user.accessToken))
        .send({ items: [{ docType: 'GOVERNMENT_ID' }, { docType: 'OTHER', note: 'Trek permit' }] })
        .expect(200);
      expect(docs.body.requiredDocs).toEqual([
        { docType: 'GOVERNMENT_ID', note: null },
        { docType: 'OTHER', note: 'Trek permit' },
      ]);

      // Clearing the address.
      const cleared = await http(app)
        .patch(`/v1/me/listings/${id}`)
        .set(bearer(user.accessToken))
        .send({ exactAddress: '', areaLabel: 'Baner, Pune' })
        .expect(200);
      expect(cleared.body).toMatchObject({ exactAddress: null, areaLabel: 'Baner, Pune' });
      await http(app)
        .patch(`/v1/me/listings/${id}`)
        .set(bearer(user.accessToken))
        .send({ lat: 19 })
        .expect(400);
    });

    it('caps photos at 8', async () => {
      const user = await lender();
      const id = await readyListing(user);
      const bytes = await photo(400, 300);
      for (let i = 1; i < 8; i++) {
        const key = await upload(app, user.accessToken, 'LISTING_PHOTO', bytes);
        await http(app)
          .post(`/v1/me/listings/${id}/photos`)
          .set(bearer(user.accessToken))
          .send({ key })
          .expect(201);
      }
      const key = await upload(app, user.accessToken, 'LISTING_PHOTO', bytes);
      const res = await http(app)
        .post(`/v1/me/listings/${id}/photos`)
        .set(bearer(user.accessToken))
        .send({ key })
        .expect(409);
      expect(res.body.error.code).toBe('LISTING_PHOTO_LIMIT');
    });

    it('keeps listings private to their owner', async () => {
      const owner = await lender();
      const id = await readyListing(owner);
      const stranger = await lender();
      await http(app).get(`/v1/me/listings/${id}`).set(bearer(stranger.accessToken)).expect(404);
      await http(app)
        .patch(`/v1/me/listings/${id}`)
        .set(bearer(stranger.accessToken))
        .send({ title: 'Stolen listing' })
        .expect(404);
      await publish(stranger, id).expect(404);
      await http(app).delete(`/v1/me/listings/${id}`).set(bearer(stranger.accessToken)).expect(404);
      await http(app).get(`/v1/listings/${id}`).expect(404); // a draft isn't public
    });
  });

  describe('publishing & moderation', () => {
    it('reviews a lender’s first listing; after approval, later ones go live at once', async () => {
      const user = await lender();
      const first = await readyListing(user);
      const res = await publish(user, first).expect(200);
      expect(res.body).toMatchObject({ inReview: true, listing: { status: 'PENDING' } });
      await http(app).get(`/v1/listings/${first}`).expect(404);
      await publish(user, first).expect(409);

      // In the admin queue, flagged as the lender's first listing.
      const queue = await http(app)
        .get('/v1/admin/listings?status=PENDING&limit=100')
        .set(bearer(ops.accessToken))
        .expect(200);
      const item = queue.body.items.find((l: { id: string }) => l.id === first);
      expect(item).toMatchObject({
        lender: { id: user.userId, firstListing: true },
        approxLat: 18.51,
        approxLng: 73.81,
      });
      expect(JSON.stringify(item)).not.toContain('Sai Residency');

      const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
      await http(app)
        .get(`/v1/admin/listings/${first}`)
        .set(bearer(support.accessToken))
        .expect(200);
      await http(app)
        .post(`/v1/admin/listings/${first}/approve`)
        .set(bearer(support.accessToken))
        .expect(403);

      const approved = await http(app)
        .post(`/v1/admin/listings/${first}/approve`)
        .set(bearer(ops.accessToken))
        .expect(200);
      expect(approved.body).toMatchObject({ status: 'LIVE', reviewedBy: expect.any(String) });
      await http(app)
        .post(`/v1/admin/listings/${first}/approve`)
        .set(bearer(ops.accessToken))
        .expect(409);

      // Public view: approximate location, lender badges, no private fields.
      const pub = await http(app).get(`/v1/listings/${first}`).expect(200);
      expect(pub.body).toMatchObject({
        title: draft.title,
        approxLat: 18.51,
        approxLng: 73.81,
        areaLabel: 'Kothrud, Pune',
        pricePerDayPaise: 15_000,
        lender: { id: user.userId, name: 'Aman Lender', phoneVerified: true, emailVerified: true },
      });
      for (const field of ['lat', 'lng', 'exactAddress', 'status']) {
        expect(pub.body).not.toHaveProperty(field);
      }
      expect(JSON.stringify(pub.body)).not.toContain('Sai Residency');
      expect(JSON.stringify(pub.body)).not.toContain(user.phone);

      // A trusted lender's next listing goes live without review.
      const second = await readyListing(user, { title: 'Canon EOS 1500D camera kit' });
      expect((await publish(user, second).expect(200)).body).toMatchObject({
        inReview: false,
        listing: { status: 'LIVE' },
      });

      // Pause hides it; unpause brings it back.
      await http(app)
        .post(`/v1/me/listings/${second}/pause`)
        .set(bearer(user.accessToken))
        .expect(200);
      await http(app).get(`/v1/listings/${second}`).expect(404);
      await http(app)
        .post(`/v1/me/listings/${second}/pause`)
        .set(bearer(user.accessToken))
        .expect(409);
      await http(app)
        .post(`/v1/me/listings/${second}/unpause`)
        .set(bearer(user.accessToken))
        .expect(200);
      await http(app).get(`/v1/listings/${second}`).expect(200);

      // Admin unpublishes: the lender sees the reason; it's no longer public.
      const removed = await http(app)
        .post(`/v1/admin/listings/${second}/unpublish`)
        .set(bearer(ops.accessToken))
        .send({ reason: 'Prohibited item' })
        .expect(200);
      expect(removed.body).toMatchObject({ status: 'REMOVED', rejectionReason: 'Prohibited item' });
      await http(app).get(`/v1/listings/${second}`).expect(404);
      await http(app)
        .patch(`/v1/me/listings/${second}`)
        .set(bearer(user.accessToken))
        .send({ title: 'Trying to edit a removed listing' })
        .expect(409);

      // The user detail shows their listings and the moderation trail.
      const detail = await http(app)
        .get(`/v1/admin/users/${user.userId}`)
        .set(bearer(ops.accessToken))
        .expect(200);
      expect(detail.body.listings).toHaveLength(2);
      expect(detail.body.activity.map((a: { action: string }) => a.action)).toEqual(
        expect.arrayContaining(['admin.listing.approve', 'admin.listing.unpublish']),
      );
    });

    it('rejects with a reason; editing returns the listing to draft for resubmission', async () => {
      const user = await lender();
      const id = await readyListing(user);
      await publish(user, id).expect(200);
      await http(app)
        .post(`/v1/admin/listings/${id}/reject`)
        .set(bearer(ops.accessToken))
        .send({ reason: 'Photos are blurry' })
        .expect(200);

      const rejected = await http(app).get(`/v1/me/listings/${id}`).set(bearer(user.accessToken));
      expect(rejected.body).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'Photos are blurry',
      });
      await publish(user, id).expect(409);

      const edited = await http(app)
        .patch(`/v1/me/listings/${id}`)
        .set(bearer(user.accessToken))
        .send({ description: 'Clearer photos now. Waterproof tent, pegs and bag included.' })
        .expect(200);
      expect(edited.body).toMatchObject({ status: 'DRAFT', rejectionReason: null });
      expect((await publish(user, id).expect(200)).body.inReview).toBe(true);
    });

    it('admin can move a listing to another category and search the queue', async () => {
      const user = await lender();
      const id = await readyListing(user, { title: 'Bosch cordless drill set' });
      await publish(user, id).expect(200);
      const categories = (await http(app).get('/v1/categories')).body;
      const tools = categories.find((c: { slug: string }) => c.slug === 'tools-diy');
      const moved = await http(app)
        .patch(`/v1/admin/listings/${id}/category`)
        .set(bearer(ops.accessToken))
        .send({ categoryId: tools.id })
        .expect(200);
      expect(moved.body.category.slug).toBe('tools-diy');

      const found = await http(app)
        .get('/v1/admin/listings?status=PENDING&search=cordless')
        .set(bearer(ops.accessToken))
        .expect(200);
      expect(found.body.items.map((l: { id: string }) => l.id)).toEqual([id]);
    });

    it('hides a suspended lender’s listings from the public', async () => {
      const user = await lender();
      const id = await readyListing(user);
      await publish(user, id).expect(200);
      await http(app)
        .post(`/v1/admin/listings/${id}/approve`)
        .set(bearer(ops.accessToken))
        .expect(200);
      await http(app).get(`/v1/listings/${id}`).expect(200);
      await http(app)
        .post(`/v1/admin/users/${user.userId}/suspend`)
        .set(bearer(ops.accessToken))
        .send({ reason: 'Fraud report' })
        .expect(200);
      await http(app).get(`/v1/listings/${id}`).expect(404);
    });
  });

  describe('deletion', () => {
    it('deleting a listing removes its photos; deleting the account removes all listings', async () => {
      const user = await lender();
      const a = await readyListing(user);
      const b = await readyListing(user);
      const photoUrl = (await http(app).get(`/v1/me/listings/${a}`).set(bearer(user.accessToken)))
        .body.photos[0].url;
      expect((await fetch(photoUrl)).status).toBe(200);

      await http(app).delete(`/v1/me/listings/${a}`).set(bearer(user.accessToken)).expect(204);
      expect((await fetch(photoUrl)).status).toBe(404);
      await http(app).get(`/v1/me/listings/${a}`).set(bearer(user.accessToken)).expect(404);
      const mine = await http(app).get('/v1/me/listings').set(bearer(user.accessToken));
      expect(mine.body.map((l: { id: string }) => l.id)).toEqual([b]);

      await http(app).delete('/v1/me').set(bearer(user.accessToken)).expect(202);
      const left = await prisma.listing.findMany({ where: { lenderId: user.userId } });
      expect(left.every((l) => l.status === 'DELETED')).toBe(true);
      expect(await prisma.listingPhoto.count({ where: { listingId: { in: [a, b] } } })).toBe(0);
    });
  });

  it('serves the marketplace rules', async () => {
    const res = await http(app).get('/v1/config').expect(200);
    expect(res.body).toMatchObject({
      commissionBps: 1000,
      pricePerDayPaise: { min: 1000, max: 1_000_000 },
      photos: { min: 1, max: 8 },
    });
  });
});
