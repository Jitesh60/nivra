import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { createAdmin, flushRedis, http, loginAdmin, loginUser } from './helpers/auth.js';
import type { InMemorySmsProvider } from './helpers/in-memory-sms.js';
import { photo, upload } from './helpers/uploads.js';

describe('Profiles, uploads & documents (e2e)', () => {
  let app: INestApplication;
  let sms: InMemorySmsProvider;
  let prisma: PrismaService;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, sms } = await createTestApp());
    prisma = app.get(PrismaService);
  });

  beforeEach(() => flushRedis(app));

  afterAll(async () => {
    await app?.close();
  });

  describe('profile & avatar', () => {
    it('updates name, city and bio; empty strings clear them', async () => {
      const user = await loginUser(app, sms);
      const res = await http(app)
        .patch('/v1/me')
        .set(bearer(user.accessToken))
        .send({ name: 'Rahul  Sharma', city: ' Pune ', bio: 'Weekend trekker.' })
        .expect(200);
      expect(res.body.user).toMatchObject({
        name: 'Rahul Sharma',
        city: 'Pune',
        bio: 'Weekend trekker.',
        idVerified: false,
      });

      const cleared = await http(app)
        .patch('/v1/me')
        .set(bearer(user.accessToken))
        .send({ bio: '' })
        .expect(200);
      expect(cleared.body.user).toMatchObject({ name: 'Rahul Sharma', city: 'Pune', bio: null });
    });

    it('turns an uploaded photo into a public 512×512 WebP without EXIF', async () => {
      const user = await loginUser(app, sms);
      const key = await upload(app, user.accessToken, 'AVATAR', await photo());
      const res = await http(app)
        .put('/v1/me/avatar')
        .set(bearer(user.accessToken))
        .send({ key })
        .expect(200);

      const avatarUrl = res.body.user.avatarUrl as string;
      expect(avatarUrl).toMatch(/\/sajha-public-media\/avatars\/.+\.webp$/);
      const served = await fetch(avatarUrl);
      expect(served.status).toBe(200);
      const meta = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 512, height: 512 });
      expect(meta.exif).toBeUndefined();

      // The upload key can't be reused, and the raw upload is gone.
      const again = await http(app)
        .put('/v1/me/avatar')
        .set(bearer(user.accessToken))
        .send({ key })
        .expect(400);
      expect(again.body.error.code).toBe('UPLOAD_NOT_FOUND');

      // Replacing deletes the old file; removing clears it.
      const second = await upload(
        app,
        user.accessToken,
        'AVATAR',
        await photo(600, 600, '#F57B0B'),
      );
      await http(app)
        .put('/v1/me/avatar')
        .set(bearer(user.accessToken))
        .send({ key: second })
        .expect(200);
      expect((await fetch(avatarUrl)).status).toBe(404);
      const removed = await http(app)
        .delete('/v1/me/avatar')
        .set(bearer(user.accessToken))
        .expect(200);
      expect(removed.body.user.avatarUrl).toBeNull();
    });

    it('rejects uploads that are not what they claim', async () => {
      const user = await loginUser(app, sms);

      // Not an image, even though it was declared as image/jpeg.
      const fake = Buffer.from('<?php system($_GET["c"]); ?>'.padEnd(200, ' '));
      const key = await upload(app, user.accessToken, 'AVATAR', fake);
      const res = await http(app)
        .put('/v1/me/avatar')
        .set(bearer(user.accessToken))
        .send({ key })
        .expect(400);
      expect(res.body.error.code).toBe('UPLOAD_INVALID');

      // Size and type are part of the signature.
      const bytes = await photo(200, 200);
      const ticket = await http(app)
        .post('/v1/uploads')
        .set(bearer(user.accessToken))
        .send({ purpose: 'AVATAR', contentType: 'image/jpeg', sizeBytes: bytes.length })
        .expect(201);
      const wrongType = await fetch(ticket.body.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: new Uint8Array(bytes),
      });
      expect(wrongType.ok).toBe(false);
      const wrongSize = await fetch(ticket.body.url, {
        method: 'PUT',
        headers: ticket.body.headers,
        body: new Uint8Array(Buffer.concat([bytes, Buffer.alloc(10)])),
      });
      expect(wrongSize.ok).toBe(false);

      // Too big, wrong type, someone else's key, wrong purpose.
      await http(app)
        .post('/v1/uploads')
        .set(bearer(user.accessToken))
        .send({ purpose: 'AVATAR', contentType: 'image/jpeg', sizeBytes: 6 * 1024 * 1024 })
        .expect(400);
      await http(app)
        .post('/v1/uploads')
        .set(bearer(user.accessToken))
        .send({ purpose: 'DOCUMENT', contentType: 'application/pdf', sizeBytes: 1000 })
        .expect(400);
      const mine = await upload(app, user.accessToken, 'AVATAR', await photo(300, 300));
      const other = await loginUser(app, sms);
      const stolen = await http(app)
        .put('/v1/me/avatar')
        .set(bearer(other.accessToken))
        .send({ key: mine })
        .expect(400);
      expect(stolen.body.error.code).toBe('UPLOAD_NOT_FOUND');
      const docKey = await upload(app, user.accessToken, 'DOCUMENT', await photo(300, 300));
      await http(app)
        .put('/v1/me/avatar')
        .set(bearer(user.accessToken))
        .send({ key: docKey })
        .expect(400);

      // A stranger submitting the key must not destroy the owner's pending upload.
      await http(app)
        .post('/v1/me/documents')
        .set(bearer(other.accessToken))
        .send({ type: 'PAN', frontKey: docKey })
        .expect(400);
      await http(app)
        .post('/v1/me/documents')
        .set(bearer(user.accessToken))
        .send({ type: 'PAN', frontKey: docKey })
        .expect(201);
    });
  });

  describe('document vault & review', () => {
    async function addDocument(token: string, type = 'AADHAAR_MASKED', withBack = true) {
      const frontKey = await upload(app, token, 'DOCUMENT', await photo(3000, 2000));
      const backKey = withBack
        ? await upload(app, token, 'DOCUMENT', await photo(3000, 2000, '#333333'))
        : undefined;
      return http(app)
        .post('/v1/me/documents')
        .set(bearer(token))
        .send({ type, frontKey, backKey });
    }

    it('upload → view (logged) → approve → ID badge → delete → badge gone', async () => {
      const user = await loginUser(app, sms);
      const created = await addDocument(user.accessToken);
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        type: 'AADHAAR_MASKED',
        status: 'PENDING',
        hasBack: true,
      });
      const id = created.body.id as string;

      // Stored re-encoded, bounded, EXIF-free, private.
      const view = await http(app)
        .get(`/v1/me/documents/${id}/view?side=back`)
        .set(bearer(user.accessToken))
        .expect(200);
      expect(view.body.expiresInSec).toBe(300);
      const file = await fetch(view.body.url);
      expect(file.headers.get('cache-control')).toContain('no-store');
      const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
      expect(meta).toMatchObject({ format: 'jpeg', width: 2400, height: 1600 });
      expect(meta.exif).toBeUndefined();
      const row = await prisma.userDocument.findUniqueOrThrow({ where: { id } });
      const bareUrl = view.body.url.split('?')[0];
      expect((await fetch(bareUrl)).status).toBe(403);
      expect(row.frontKey).toMatch(/^documents\//);
      expect(
        await prisma.auditLog.count({ where: { action: 'document.view', targetId: id } }),
      ).toBe(1);

      // Ops reviews it.
      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      const queue = await http(app)
        .get('/v1/admin/documents?status=PENDING&limit=100')
        .set(bearer(ops.accessToken))
        .expect(200);
      expect(queue.body.items.map((d: { id: string }) => d.id)).toContain(id);
      await http(app)
        .get(`/v1/admin/documents/${id}/view`)
        .set(bearer(ops.accessToken))
        .expect(200);
      expect(
        await prisma.auditLog.count({ where: { action: 'admin.document.view', targetId: id } }),
      ).toBe(1);

      const approved = await http(app)
        .post(`/v1/admin/documents/${id}/approve`)
        .set(bearer(ops.accessToken))
        .expect(200);
      expect(approved.body).toMatchObject({ status: 'APPROVED', reviewedBy: 'Test OPS' });
      const twice = await http(app)
        .post(`/v1/admin/documents/${id}/approve`)
        .set(bearer(ops.accessToken))
        .expect(409);
      expect(twice.body.error.code).toBe('DOCUMENT_NOT_PENDING');

      expect(
        (await http(app).get('/v1/me').set(bearer(user.accessToken))).body.user.idVerified,
      ).toBe(true);

      await http(app).delete(`/v1/me/documents/${id}`).set(bearer(user.accessToken)).expect(204);
      expect(
        (await http(app).get('/v1/me').set(bearer(user.accessToken))).body.user.idVerified,
      ).toBe(false);
      expect((await fetch(view.body.url)).status).toBe(404);
      await http(app).get(`/v1/me/documents/${id}/view`).set(bearer(user.accessToken)).expect(404);
    });

    it('rejects with a reason; the user can then upload that type again', async () => {
      const user = await loginUser(app, sms);
      const first = await addDocument(user.accessToken, 'PAN', false);
      const duplicate = await addDocument(user.accessToken, 'PAN', false);
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('DOCUMENT_ALREADY_EXISTS');

      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      const rejected = await http(app)
        .post(`/v1/admin/documents/${first.body.id}/reject`)
        .set(bearer(ops.accessToken))
        .send({ reason: 'The photo is blurry.' })
        .expect(200);
      expect(rejected.body).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'The photo is blurry.',
      });

      const list = await http(app)
        .get('/v1/me/documents')
        .set(bearer(user.accessToken))
        .expect(200);
      expect(list.body[0]).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'The photo is blurry.',
      });
      expect((await addDocument(user.accessToken, 'PAN', false)).status).toBe(201);
    });

    it('expired documents do not earn the badge; OTHER needs a label', async () => {
      const user = await loginUser(app, sms);
      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      const frontKey = await upload(app, user.accessToken, 'DOCUMENT', await photo(800, 500));
      const noLabel = await http(app)
        .post('/v1/me/documents')
        .set(bearer(user.accessToken))
        .send({ type: 'OTHER', frontKey })
        .expect(400);
      expect(Object.keys(noLabel.body.error.details)).toContain('label');

      const collegeKey = await upload(app, user.accessToken, 'DOCUMENT', await photo(800, 500));
      const doc = await http(app)
        .post('/v1/me/documents')
        .set(bearer(user.accessToken))
        .send({ type: 'COLLEGE_ID', frontKey: collegeKey, expiresOn: '2020-01-31' })
        .expect(201);
      await http(app)
        .post(`/v1/admin/documents/${doc.body.id}/approve`)
        .set(bearer(ops.accessToken))
        .expect(200);
      expect(
        (await http(app).get('/v1/me').set(bearer(user.accessToken))).body.user.idVerified,
      ).toBe(false);
    });

    it('keeps documents private between users and away from Support', async () => {
      const owner = await loginUser(app, sms);
      const doc = await addDocument(owner.accessToken, 'VOTER_ID', false);
      const stranger = await loginUser(app, sms);
      await http(app)
        .get(`/v1/me/documents/${doc.body.id}/view`)
        .set(bearer(stranger.accessToken))
        .expect(404);
      await http(app)
        .delete(`/v1/me/documents/${doc.body.id}`)
        .set(bearer(stranger.accessToken))
        .expect(404);

      const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
      await http(app).get('/v1/admin/documents').set(bearer(support.accessToken)).expect(403);
      await http(app)
        .post(`/v1/admin/documents/${doc.body.id}/approve`)
        .set(bearer(support.accessToken))
        .expect(403);
    });
  });

  describe('admin user management', () => {
    it('shows the user detail with documents, sessions and activity', async () => {
      const user = await loginUser(app, sms);
      await http(app)
        .patch('/v1/me')
        .set(bearer(user.accessToken))
        .send({ name: 'Priya', city: 'Dehradun' });
      const frontKey = await upload(app, user.accessToken, 'DOCUMENT', await photo(800, 500));
      await http(app)
        .post('/v1/me/documents')
        .set(bearer(user.accessToken))
        .send({ type: 'PASSPORT', frontKey })
        .expect(201);

      const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
      const detail = await http(app)
        .get(`/v1/admin/users/${user.userId}`)
        .set(bearer(support.accessToken))
        .expect(200);
      expect(detail.body.user).toMatchObject({ name: 'Priya', city: 'Dehradun' });
      expect(detail.body.documents).toHaveLength(1);
      expect(detail.body.activeSessions).toBe(1);
      expect(detail.body.activity.map((a: { action: string }) => a.action)).toContain(
        'user.document.upload',
      );
    });

    it('suspend signs the user out; ban and reactivate follow the rules; Support cannot', async () => {
      const user = await loginUser(app, sms);
      const support = await loginAdmin(app, await createAdmin(app, 'SUPPORT'));
      await http(app)
        .post(`/v1/admin/users/${user.userId}/suspend`)
        .set(bearer(support.accessToken))
        .send({ reason: 'test' })
        .expect(403);

      const ops = await loginAdmin(app, await createAdmin(app, 'OPS'));
      const suspended = await http(app)
        .post(`/v1/admin/users/${user.userId}/suspend`)
        .set(bearer(ops.accessToken))
        .send({ reason: 'Reported by lenders' })
        .expect(200);
      expect(suspended.body.user.status).toBe('SUSPENDED');
      expect(suspended.body.activeSessions).toBe(0);
      await http(app).get('/v1/me').set(bearer(user.accessToken)).expect(401);

      const again = await http(app)
        .post(`/v1/admin/users/${user.userId}/suspend`)
        .set(bearer(ops.accessToken))
        .send({ reason: 'twice' })
        .expect(409);
      expect(again.body.error.code).toBe('USER_STATUS_CONFLICT');

      await http(app)
        .post(`/v1/admin/users/${user.userId}/ban`)
        .set(bearer(ops.accessToken))
        .send({ reason: 'Fraud' })
        .expect(200);
      const back = await http(app)
        .post(`/v1/admin/users/${user.userId}/reactivate`)
        .set(bearer(ops.accessToken))
        .send({ reason: 'Appeal accepted' })
        .expect(200);
      expect(back.body.user.status).toBe('ACTIVE');
      expect(
        await prisma.auditLog.findMany({
          where: { targetId: user.userId, action: { startsWith: 'admin.user.' } },
          orderBy: { createdAt: 'asc' },
        }),
      ).toEqual([
        expect.objectContaining({
          action: 'admin.user.suspend',
          metadata: { reason: 'Reported by lenders' },
        }),
        expect.objectContaining({ action: 'admin.user.ban' }),
        expect.objectContaining({ action: 'admin.user.reactivate' }),
      ]);
      // They can sign in again.
      expect((await loginUser(app, sms, user.phone)).isNewUser).toBe(false);
    });
  });
});
