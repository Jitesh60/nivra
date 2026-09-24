import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { createAdmin, flushRedis, http, loginAdmin, uniqueEmail } from './helpers/auth.js';

describe('Waitlist (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const join = (body: Record<string, unknown>) => http(app).post('/v1/waitlist').send(body);

  beforeAll(async () => {
    ({ app } = await createTestApp());
    prisma = app.get(PrismaService);
  });

  beforeEach(() => flushRedis(app));

  afterAll(async () => {
    await app?.close();
  });

  it('adds an email once and reports a second join as already joined', async () => {
    const email = uniqueEmail('wait');
    const first = await join({
      email: `  ${email.toUpperCase()} `,
      city: ' Pune ',
      role: 'BORROWER',
      source: 'instagram',
    }).expect(200);
    expect(first.body).toEqual({ ok: true, alreadyJoined: false });

    const again = await join({ email }).expect(200);
    expect(again.body).toEqual({ ok: true, alreadyJoined: true });

    const row = await prisma.waitlistEntry.findUniqueOrThrow({ where: { email } });
    expect(row).toMatchObject({ email, city: 'Pune', role: 'BORROWER', source: 'instagram' });
  });

  it('silently drops honeypot submissions', async () => {
    const email = uniqueEmail('bot');
    const res = await join({ email, website: 'http://spam.example' }).expect(200);
    expect(res.body).toEqual({ ok: true, alreadyJoined: false });
    expect(await prisma.waitlistEntry.count({ where: { email } })).toBe(0);
  });

  it('validates input', async () => {
    const res = await join({ email: 'not-an-email', role: 'ADMIN' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.error.details)).toEqual(expect.arrayContaining(['email', 'role']));
  });

  it('limits sign-ups to 10 per IP per hour', async () => {
    for (let i = 0; i < 10; i++) await join({ email: uniqueEmail('burst') }).expect(200);
    const res = await join({ email: uniqueEmail('burst') }).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('lets Ops and Super Admins list and export; Support cannot', async () => {
    const email = uniqueEmail('export');
    await join({ email, city: '=cmd|calc', role: 'LENDER' }).expect(200);

    const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
    const page = await http(app)
      .get('/v1/admin/waitlist?limit=5')
      .set('Authorization', `Bearer ${ops.accessToken}`)
      .expect(200);
    expect(page.body.total).toBeGreaterThanOrEqual(1);
    expect(page.body.items[0].email).toBe(email);

    const csv = await http(app)
      .get('/v1/admin/waitlist/export.csv')
      .set('Authorization', `Bearer ${ops.accessToken}`)
      .expect(200);
    expect(csv.headers['content-type']).toMatch(/^text\/csv/);
    expect(csv.headers['content-disposition']).toContain('sajha-waitlist.csv');
    expect(csv.text.split('\r\n')[0]).toBe('email,city,role,source,joined_at');
    expect(csv.text).toContain(`${email},'=cmd|calc,LENDER,,`);

    const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
    await http(app)
      .get('/v1/admin/waitlist')
      .set('Authorization', `Bearer ${support.accessToken}`)
      .expect(403);
    await http(app).get('/v1/admin/waitlist/export.csv').expect(401);
  });
});
