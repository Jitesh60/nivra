import type { INestApplication } from '@nestjs/common';
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
import type { InMemorySmsProvider } from './helpers/in-memory-sms.js';

/**
 * Discovery around Dehradun (no other suite puts listings here). Base point:
 * Clock Tower. North is ~1.11 km per 0.01° of latitude.
 */
const BASE = { lat: 30.3244, lng: 78.0419 };
const at = (kmNorth: number) => ({ lat: BASE.lat + kmNorth / 111.2, lng: BASE.lng });
const iso = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('Discovery & search (e2e)', () => {
  let app: INestApplication;
  let sms: InMemorySmsProvider;
  let prisma: PrismaService;
  let lender: UserSession;
  let verifiedLender: UserSession;
  let borrower: UserSession;
  let trekking: string;
  let cameras: string;
  const ids: Record<string, string> = {};
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const search = (query: Record<string, string | number | boolean>, token?: string) => {
    const req = http(app)
      .get('/v1/search')
      .query({ lat: BASE.lat, lng: BASE.lng, ...query });
    return token ? req.set(bearer(token)) : req;
  };
  const titles = (res: { body: { items: { title: string }[] } }) =>
    res.body.items.map((i) => i.title);

  async function listing(
    key: string,
    owner: UserSession,
    fields: {
      title: string;
      km: number | null;
      categoryId?: string;
      price?: number;
      condition?: 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR';
      status?: 'LIVE' | 'PAUSED' | 'PENDING';
      minDays?: number;
      advanceNoticeDays?: number;
      weeklyDiscountPct?: number;
      brand?: string;
      description?: string;
    },
  ) {
    const pos = fields.km === null ? { lat: 12.9716, lng: 77.5946 } : at(fields.km); // Bengaluru
    const l = await prisma.listing.create({
      data: {
        lenderId: owner.userId,
        categoryId: fields.categoryId ?? trekking,
        title: fields.title,
        description: fields.description ?? 'Kept clean and dry, ready for your next trip.',
        condition: fields.condition ?? 'GOOD',
        brand: fields.brand,
        pricePerDayPaise: fields.price ?? 15_000,
        weeklyDiscountPct: fields.weeklyDiscountPct ?? 0,
        depositPaise: 100_000,
        minDays: fields.minDays ?? 1,
        maxDays: 14,
        advanceNoticeDays: fields.advanceNoticeDays ?? 0,
        ...pos,
        areaLabel: 'Dehradun',
        status: fields.status ?? 'LIVE',
        publishedAt: new Date(),
      },
    });
    ids[key] = l.id;
    return l.id;
  }

  beforeAll(async () => {
    ({ app, sms } = await createTestApp());
    prisma = app.get(PrismaService);
    const cats = await prisma.category.findMany();
    trekking = cats.find((c) => c.slug === 'trekking-outdoor')!.id;
    cameras = cats.find((c) => c.slug === 'cameras-electronics')!.id;
    lender = await loginUser(app, sms);
    verifiedLender = await loginUser(app, sms);
    borrower = await loginUser(app, sms);
    await prisma.user.update({ where: { id: lender.userId }, data: { name: 'Aman' } });
    await prisma.userDocument.create({
      data: { userId: verifiedLender.userId, type: 'PAN', frontKey: 'x', status: 'APPROVED' },
    });

    await listing('tent', lender, {
      title: 'Quechua dome tent for two',
      km: 0.3,
      price: 20_000,
      weeklyDiscountPct: 10,
    });
    await listing('poles', verifiedLender, {
      title: 'Trekking poles pair',
      km: 3,
      price: 5_000,
      condition: 'LIKE_NEW',
    });
    await listing('camera', lender, {
      title: 'Canon EOS 1500D kit',
      km: 4,
      categoryId: cameras,
      price: 80_000,
      condition: 'NEW',
      brand: 'Canon',
      description: 'DSLR with a 18-55mm lens, two batteries and a bag.',
    });
    await listing('farTent', lender, { title: 'Big family tent', km: 8 });
    await listing('bengaluru', lender, { title: 'Tent in Bengaluru', km: null });
    await listing('paused', lender, { title: 'Paused tent nearby', km: 1, status: 'PAUSED' });
    await listing('pending', lender, { title: 'Pending tent nearby', km: 1, status: 'PENDING' });
    await listing('busy', lender, {
      title: 'Sleeping bag, booked',
      km: 2,
      minDays: 2,
      advanceNoticeDays: 2,
    });
    await prisma.availabilityBlock.create({
      data: {
        listingId: ids.busy!,
        startsOn: new Date(`${iso(10)}T00:00:00Z`),
        endsOn: new Date(`${iso(12)}T00:00:00Z`),
      },
    });
  });

  beforeEach(() => flushRedis(app));

  afterAll(async () => {
    await app?.close();
  });

  it('finds live items within the radius, closest first, with rounded distances', async () => {
    const res = await search({ radiusKm: 5 }).expect(200);
    expect(res.body.sort).toBe('distance');
    expect(titles(res)).toEqual([
      'Quechua dome tent for two',
      'Sleeping bag, booked',
      'Trekking poles pair',
      'Canon EOS 1500D kit',
    ]);
    expect(res.body.items.map((i: { distanceKm: number }) => i.distanceKm)).toEqual([0.5, 2, 3, 4]);
    // Paused, pending, far away and other cities never appear.
    expect(titles(await search({ radiusKm: 10 }))).toContain('Big family tent');
    expect(titles(await search({ radiusKm: 25 }))).not.toContain('Tent in Bengaluru');
    // No exact coordinates or addresses anywhere.
    for (const item of res.body.items) {
      expect(item).not.toHaveProperty('lat');
      expect(item).not.toHaveProperty('lng');
      expect(item).not.toHaveProperty('exactAddress');
    }
  });

  it('matches keywords with stemming and ranks by relevance', async () => {
    const res = await search({ q: 'tents', radiusKm: 25 }).expect(200);
    expect(res.body.sort).toBe('relevance');
    expect(titles(res)).toEqual(
      expect.arrayContaining(['Quechua dome tent for two', 'Big family tent']),
    );
    expect(titles(res)).not.toContain('Trekking poles pair');
    // Brand, category name and description are searchable too.
    expect(titles(await search({ q: 'canon' }))).toEqual(['Canon EOS 1500D kit']);
    expect(titles(await search({ q: 'lens batteries' }))).toEqual(['Canon EOS 1500D kit']);
    expect(titles(await search({ q: 'electronics' }))).toEqual(['Canon EOS 1500D kit']);
  });

  it('keeps only items free on the dates, and quotes rent for them', async () => {
    const free = await search({ radiusKm: 5, startDate: iso(10), endDate: iso(11) }).expect(200);
    expect(titles(free)).not.toContain('Sleeping bag, booked'); // blocked
    const tent = free.body.items.find(
      (i: { title: string }) => i.title === 'Quechua dome tent for two',
    );
    expect(tent).toMatchObject({ days: 2, rentPaise: 40_000 });

    // Outside the block but too short (min 2 days), then too soon (2 days' notice).
    expect(
      titles(await search({ radiusKm: 5, startDate: iso(20), endDate: iso(20) })),
    ).not.toContain('Sleeping bag, booked');
    expect(titles(await search({ radiusKm: 5, startDate: iso(1), endDate: iso(3) }))).not.toContain(
      'Sleeping bag, booked',
    );
    expect(titles(await search({ radiusKm: 5, startDate: iso(20), endDate: iso(21) }))).toContain(
      'Sleeping bag, booked',
    );

    // Bad dates.
    await search({ startDate: iso(5), endDate: iso(3) }).expect(400);
    await search({ startDate: iso(-2), endDate: iso(1) }).expect(400);
    await search({ startDate: iso(5) }).expect(400);
  });

  it('filters by category, price, condition and verified lenders; sorts by price', async () => {
    expect(titles(await search({ categoryId: cameras }))).toEqual(['Canon EOS 1500D kit']);
    expect(titles(await search({ minPricePaise: 10_000, maxPricePaise: 30_000 }))).toEqual([
      'Quechua dome tent for two',
      'Sleeping bag, booked',
    ]);
    expect(titles(await search({ condition: 'NEW,LIKE_NEW' }))).toEqual([
      'Trekking poles pair',
      'Canon EOS 1500D kit',
    ]);
    expect(titles(await search({ verifiedLendersOnly: true }))).toEqual(['Trekking poles pair']);
    const cheapest = await search({ sort: 'price_asc' });
    expect(cheapest.body.items[0].title).toBe('Trekking poles pair');
    const dearest = await search({ sort: 'price_desc' });
    expect(dearest.body.items[0].title).toBe('Canon EOS 1500D kit');
    await search({ minPricePaise: 5000, maxPricePaise: 100 }).expect(400);
    await http(app).get('/v1/search').query({ sort: 'distance' }).expect(400);
    await http(app).get('/v1/search').query({ lat: BASE.lat }).expect(400);
  });

  it('pages with a cursor, without repeats', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await search({ radiusKm: 10, limit: 2, ...(cursor ? { cursor } : {}) }).expect(
        200,
      );
      seen.push(...res.body.items.map((i: { id: string }) => i.id));
      cursor = res.body.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    await search({ cursor: 'garbage' }).expect(400);
  });

  it('hides a suspended lender’s listings', async () => {
    const other = await loginUser(app, sms);
    await listing('suspended', other, { title: 'Suspended lender tent', km: 1 });
    expect(titles(await search({ q: 'suspended' }))).toEqual(['Suspended lender tent']);
    await prisma.user.update({ where: { id: other.userId }, data: { status: 'SUSPENDED' } });
    expect(titles(await search({ q: 'suspended' }))).toEqual([]);
    await http(app).get(`/v1/listings/${ids.suspended}`).expect(404);
  });

  it('wishlist: guests see no saved flags; saving is idempotent and never your own', async () => {
    await http(app).put(`/v1/me/favorites/${ids.tent}`).expect(401);
    await http(app)
      .put(`/v1/me/favorites/${ids.tent}`)
      .set(bearer(borrower.accessToken))
      .expect(204);
    await http(app)
      .put(`/v1/me/favorites/${ids.tent}`)
      .set(bearer(borrower.accessToken))
      .expect(204);
    await http(app)
      .put(`/v1/me/favorites/${ids.paused}`)
      .set(bearer(borrower.accessToken))
      .expect(404);
    const own = await http(app)
      .put(`/v1/me/favorites/${ids.tent}`)
      .set(bearer(lender.accessToken))
      .expect(400);
    expect(own.body.error.code).toBe('FAVORITE_OWN_LISTING');

    const saved = (res: { body: { items: { id: string; saved: boolean }[] } }) =>
      res.body.items.find((i) => i.id === ids.tent)!.saved;
    expect(saved(await search({}))).toBe(false);
    expect(saved(await search({}, borrower.accessToken))).toBe(true);

    const detail = await http(app)
      .get(`/v1/listings/${ids.tent}`)
      .set(bearer(borrower.accessToken))
      .expect(200);
    expect(detail.body).toMatchObject({ saved: true, favoriteCount: 1 });
    expect(detail.body).not.toHaveProperty('lat');

    // Taken down later: kept in the wishlist, marked unavailable.
    await prisma.listing.update({ where: { id: ids.tent }, data: { status: 'PAUSED' } });
    const list = await http(app)
      .get('/v1/me/favorites')
      .set(bearer(borrower.accessToken))
      .expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({ id: ids.tent, available: false, saved: true }),
    ]);
    await prisma.listing.update({ where: { id: ids.tent }, data: { status: 'LIVE' } });

    await http(app)
      .delete(`/v1/me/favorites/${ids.tent}`)
      .set(bearer(borrower.accessToken))
      .expect(204);
    expect(
      (await http(app).get('/v1/me/favorites').set(bearer(borrower.accessToken))).body,
    ).toEqual([]);
    // A stale token isn't treated as a guest: the app must refresh it.
    await http(app).get('/v1/search').set(bearer('not-a-token')).expect(401);
  });

  it('counts one view per viewer per day and ranks popular items', async () => {
    const view = (id: string, token?: string, ua = 'Test/1.0') => {
      const req = http(app).get(`/v1/listings/${id}`).set('User-Agent', ua);
      return (token ? req.set(bearer(token)) : req).expect(200);
    };
    await view(ids.camera!, borrower.accessToken);
    await view(ids.camera!, borrower.accessToken); // same viewer, same day
    await view(ids.camera!, undefined, 'Guest/1');
    await view(ids.camera!, undefined, 'Guest/1'); // same guest
    await view(ids.camera!, undefined, 'Guest/2');
    await view(ids.camera!, lender.accessToken); // the lender's own view doesn't count
    await view(ids.poles!, borrower.accessToken);
    expect(await prisma.listingView.count({ where: { listingId: ids.camera } })).toBe(3);
    const keys = await prisma.listingView.findMany({ where: { listingId: ids.camera } });
    expect(keys.every((k) => !k.viewerKey.includes('127.0.0.1'))).toBe(true);

    // A save counts as 3 views.
    await http(app)
      .put(`/v1/me/favorites/${ids.poles}`)
      .set(bearer(borrower.accessToken))
      .expect(204);
    const home = await http(app).get('/v1/home').query(BASE).expect(200);
    expect(home.body.popularThisWeek.map((c: { id: string }) => c.id).slice(0, 2)).toEqual([
      ids.poles,
      ids.camera,
    ]);
    expect(home.body.nearYou[0].id).toBe(ids.tent);
    expect(home.body.categories.length).toBeGreaterThan(5);
    expect(home.body.newest.map((c: { id: string }) => c.id)).not.toContain(ids.bengaluru);
  });

  it('quotes dates with the weekly discount and explains unavailability', async () => {
    const week = await http(app)
      .get(`/v1/listings/${ids.tent}/quote`)
      .query({ startDate: iso(3), endDate: iso(9) })
      .expect(200);
    expect(week.body).toEqual({
      days: 7,
      pricePerDayPaise: 20_000,
      rentBeforeDiscountPaise: 140_000,
      weeklyDiscountPaise: 14_000,
      rentPaise: 126_000,
      feePaise: 0,
      depositPaise: 100_000,
      creditPaise: 0,
      totalPaise: 226_000,
      available: true,
      unavailableReason: null,
    });
    const blocked = await http(app)
      .get(`/v1/listings/${ids.busy}/quote`)
      .query({ startDate: iso(11), endDate: iso(13) })
      .expect(200);
    expect(blocked.body).toMatchObject({ available: false, unavailableReason: 'BLOCKED' });
    await http(app)
      .get(`/v1/listings/${ids.paused}/quote`)
      .query({ startDate: iso(3), endDate: iso(4) })
      .expect(404);
  });

  it('serves cards for recently viewed ids, live only, in order', async () => {
    const res = await http(app)
      .get('/v1/listings')
      .query({ ids: [ids.camera, ids.paused, ids.tent].join(',') })
      .expect(200);
    expect(res.body.map((c: { id: string }) => c.id)).toEqual([ids.camera, ids.tent]);
    await http(app).get('/v1/listings').query({ ids: 'nope' }).expect(400);
  });

  it('keeps working for admins and lenders after a listing changes', async () => {
    // Renaming a category re-indexes its listings for search.
    const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
    await http(app)
      .patch(`/v1/admin/categories/${cameras}`)
      .set(bearer(ops.accessToken))
      .send({ name: 'Photography gear' })
      .expect(200);
    expect(titles(await search({ q: 'photography' }))).toEqual(['Canon EOS 1500D kit']);
    await http(app)
      .patch(`/v1/admin/categories/${cameras}`)
      .set(bearer(ops.accessToken))
      .send({ name: 'Cameras & electronics' })
      .expect(200);
  });
});
