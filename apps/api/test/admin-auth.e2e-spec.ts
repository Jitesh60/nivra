import type { INestApplication } from '@nestjs/common';
import { generate } from 'otplib';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import {
  createAdmin,
  flushRedis,
  http,
  loginAdmin,
  loginUser,
  uniqueEmail,
  uniquePhone,
} from './helpers/auth.js';
import type { InMemorySmsProvider } from './helpers/in-memory-sms.js';

describe('Admin auth (e2e)', () => {
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

  const login = (email: string, password: string) =>
    http(app).post('/v1/admin/auth/login').send({ email, password });

  describe('first login and 2FA setup', () => {
    it('never issues tokens for a password alone, and forces TOTP setup', async () => {
      const admin = await createAdmin(app, 'OPS', { withTotp: false });
      const step1 = await login(admin.email.toUpperCase(), admin.password).expect(200);
      expect(Object.keys(step1.body).sort()).toEqual(['mfaSetupRequired', 'mfaToken']);
      expect(step1.body.mfaSetupRequired).toBe(true);

      // The 2FA token is not an access token.
      const misuse = await http(app)
        .get('/v1/admin/me')
        .set(bearer(step1.body.mfaToken))
        .expect(401);
      expect(misuse.body.error.code).toBe('TOKEN_INVALID');

      // Verifying before setup is refused.
      const early = await http(app)
        .post('/v1/admin/auth/2fa/verify')
        .send({ mfaToken: step1.body.mfaToken, code: '123456' })
        .expect(400);
      expect(early.body.error.code).toBe('MFA_SETUP_REQUIRED');

      const setup = await http(app)
        .post('/v1/admin/auth/2fa/setup')
        .send({ mfaToken: step1.body.mfaToken })
        .expect(200);
      expect(setup.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      const secret = new URL(setup.body.otpauthUrl).searchParams.get('secret')!;

      const bad = await http(app)
        .post('/v1/admin/auth/2fa/verify')
        .send({ mfaToken: step1.body.mfaToken, code: '000000' })
        .expect(401);
      expect(bad.body.error.code).toBe('MFA_INVALID');

      const done = await http(app)
        .post('/v1/admin/auth/2fa/verify')
        .send({ mfaToken: step1.body.mfaToken, code: await generate({ secret }) })
        .expect(200);
      expect(done.body.admin).toMatchObject({ id: admin.id, twoFactorEnabled: true });
      expect(done.body.recoveryCodes).toHaveLength(8);
      expect(done.body.expiresInSec).toBe(600);

      const me = await http(app).get('/v1/admin/me').set(bearer(done.body.accessToken)).expect(200);
      expect(me.body.admin.email).toBe(admin.email);

      // Once enabled, setup can't be run again to swap the secret.
      const step2 = await login(admin.email, admin.password).expect(200);
      expect(step2.body.mfaSetupRequired).toBe(false);
      const again = await http(app)
        .post('/v1/admin/auth/2fa/setup')
        .send({ mfaToken: step2.body.mfaToken })
        .expect(409);
      expect(again.body.error.code).toBe('MFA_ALREADY_ENABLED');

      // Stored encrypted, never in plain text.
      const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
      expect(row.totpSecretEnc).not.toContain(secret);
    });
  });

  describe('sign in with 2FA enabled', () => {
    it('rejects a replayed TOTP code', async () => {
      const admin = await createAdmin(app, 'OPS');
      const code = await generate({ secret: admin.totpSecret });
      const first = await login(admin.email, admin.password).expect(200);
      await http(app)
        .post('/v1/admin/auth/2fa/verify')
        .send({ mfaToken: first.body.mfaToken, code })
        .expect(200);

      const second = await login(admin.email, admin.password).expect(200);
      const replay = await http(app)
        .post('/v1/admin/auth/2fa/verify')
        .send({ mfaToken: second.body.mfaToken, code })
        .expect(401);
      expect(replay.body.error.code).toBe('MFA_INVALID');
    });

    it('accepts each recovery code once', async () => {
      const admin = await createAdmin(app, 'OPS', { withTotp: false });
      const step1 = await login(admin.email, admin.password).expect(200);
      const setup = await http(app)
        .post('/v1/admin/auth/2fa/setup')
        .send({ mfaToken: step1.body.mfaToken })
        .expect(200);
      const secret = new URL(setup.body.otpauthUrl).searchParams.get('secret')!;
      const enabled = await http(app)
        .post('/v1/admin/auth/2fa/verify')
        .send({ mfaToken: step1.body.mfaToken, code: await generate({ secret }) })
        .expect(200);
      const [recovery] = enabled.body.recoveryCodes as string[];

      const step2 = await login(admin.email, admin.password).expect(200);
      await http(app)
        .post('/v1/admin/auth/2fa/verify')
        .send({ mfaToken: step2.body.mfaToken, recoveryCode: recovery!.toUpperCase() })
        .expect(200);

      const step3 = await login(admin.email, admin.password).expect(200);
      const reused = await http(app)
        .post('/v1/admin/auth/2fa/verify')
        .send({ mfaToken: step3.body.mfaToken, recoveryCode: recovery })
        .expect(401);
      expect(reused.body.error.code).toBe('MFA_INVALID');
    });

    it('locks the account for 15 minutes after 5 failures', async () => {
      const admin = await createAdmin(app, 'OPS');
      for (let i = 0; i < 5; i++) {
        const res = await login(admin.email, 'wrong password!').expect(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      }
      const locked = await login(admin.email, admin.password).expect(429);
      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
      expect(locked.body.error.details.retryAfterSec).toBeGreaterThan(14 * 60);

      const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
      expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
      expect(
        await prisma.auditLog.count({ where: { actorId: admin.id, action: 'admin.login.locked' } }),
      ).toBe(1);
    });

    it('wrong 2FA codes count towards the lockout too', async () => {
      const admin = await createAdmin(app, 'OPS');
      for (let i = 0; i < 5; i++) {
        const step1 = await login(admin.email, admin.password).expect(200);
        await http(app)
          .post('/v1/admin/auth/2fa/verify')
          .send({ mfaToken: step1.body.mfaToken, code: '000000' })
          .expect(401);
      }
      await login(admin.email, admin.password).expect(429);
    });

    it('gives the same answer for an unknown email', async () => {
      const res = await login(uniqueEmail('nobody'), 'whatever password').expect(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('a disabled admin cannot sign in', async () => {
      const admin = await createAdmin(app, 'OPS');
      await prisma.adminUser.update({ where: { id: admin.id }, data: { status: 'DISABLED' } });
      const res = await login(admin.email, admin.password).expect(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('writes audit entries for sign-in', async () => {
      const admin = await createAdmin(app, 'SUPPORT');
      await login(admin.email, 'wrong password!').expect(401);
      await loginAdmin(app, admin);
      const actions = (
        await prisma.auditLog.findMany({
          where: { actorId: admin.id },
          orderBy: { createdAt: 'asc' },
        })
      ).map((a) => a.action);
      expect(actions).toEqual(['admin.login.failed', 'admin.login']);
    });
  });

  describe('sessions', () => {
    it('rotates refresh tokens and detects reuse', async () => {
      const admin = await createAdmin(app, 'OPS');
      const session = await loginAdmin(app, admin);
      const rotated = await http(app)
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);
      const reuse = await http(app)
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
      expect(reuse.body.error.code).toBe('REFRESH_REUSED');
      await http(app).get('/v1/admin/me').set(bearer(rotated.body.accessToken)).expect(401);
    });

    it('does not extend a session past 12 hours', async () => {
      const admin = await createAdmin(app, 'OPS');
      const session = await loginAdmin(app, admin);
      const before = await prisma.session.findFirstOrThrow({ where: { adminUserId: admin.id } });
      await http(app)
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);
      const after = await prisma.session.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
      const lifetimeMs = before.expiresAt.getTime() - before.createdAt.getTime();
      expect(Math.abs(lifetimeMs - 12 * 3600_000)).toBeLessThan(5_000);
    });

    it('lists own sessions and revokes another one', async () => {
      const admin = await createAdmin(app, 'OPS');
      const a = await loginAdmin(app, admin);
      // Second login in the next TOTP window (the current code was just used).
      const step1 = await login(admin.email, admin.password).expect(200);
      const b = await http(app)
        .post('/v1/admin/auth/2fa/verify')
        .send({
          mfaToken: step1.body.mfaToken,
          code: await generate({
            secret: admin.totpSecret,
            epoch: Math.floor(Date.now() / 1000) + 30,
          }),
        })
        .expect(200);

      const list = await http(app)
        .get('/v1/admin/me/sessions')
        .set(bearer(a.accessToken))
        .expect(200);
      expect(list.body).toHaveLength(2);
      const other = list.body.find((s: { current: boolean }) => !s.current);
      await http(app)
        .delete(`/v1/admin/me/sessions/${other.id}`)
        .set(bearer(a.accessToken))
        .expect(204);
      await http(app).get('/v1/admin/me').set(bearer(b.body.accessToken)).expect(401);

      const stranger = await loginAdmin(app, await createAdmin(app, 'OPS'));
      await http(app)
        .delete(
          `/v1/admin/me/sessions/${list.body.find((s: { current: boolean }) => s.current).id}`,
        )
        .set(bearer(stranger.accessToken))
        .expect(404);
    });

    it('logout ends the session', async () => {
      const admin = await createAdmin(app, 'OPS');
      const session = await loginAdmin(app, admin);
      await http(app).post('/v1/admin/auth/logout').set(bearer(session.accessToken)).expect(204);
      await http(app).get('/v1/admin/me').set(bearer(session.accessToken)).expect(401);
    });

    it('user and admin tokens are not interchangeable', async () => {
      const admin = await createAdmin(app, 'SUPER_ADMIN');
      const adminSession = await loginAdmin(app, admin);
      const user = await loginUser(app, sms, uniquePhone());

      const userOnAdmin = await http(app)
        .get('/v1/admin/me')
        .set(bearer(user.accessToken))
        .expect(401);
      expect(userOnAdmin.body.error.code).toBe('TOKEN_INVALID');
      await http(app).get('/v1/me').set(bearer(adminSession.accessToken)).expect(401);
      await http(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: adminSession.refreshToken })
        .expect(401);
    });
  });

  describe('roles and admin management', () => {
    it('only SUPER_ADMIN can manage admins; every role can list users', async () => {
      for (const role of ['OPS', 'SUPPORT'] as const) {
        const admin = await createAdmin(app, role);
        const { accessToken } = await loginAdmin(app, admin);
        const res = await http(app).get('/v1/admin/admins').set(bearer(accessToken)).expect(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
        await http(app)
          .post('/v1/admin/admins')
          .set(bearer(accessToken))
          .send({ email: uniqueEmail(), name: 'Nope', role: 'SUPER_ADMIN' })
          .expect(403);
        await http(app).get('/v1/admin/users').set(bearer(accessToken)).expect(200);
      }
    });

    it('invites an admin who must change the temporary password first', async () => {
      const root = await createAdmin(app, 'SUPER_ADMIN');
      const { accessToken } = await loginAdmin(app, root);
      const email = uniqueEmail('invitee');

      const created = await http(app)
        .post('/v1/admin/admins')
        .set(bearer(accessToken))
        .send({ email, name: 'New Ops', role: 'OPS' })
        .expect(201);
      expect(created.body.admin).toMatchObject({ email, role: 'OPS', mustChangePassword: true });
      const temp = created.body.temporaryPassword as string;

      const dup = await http(app)
        .post('/v1/admin/admins')
        .set(bearer(accessToken))
        .send({ email: email.toUpperCase(), name: 'Dup', role: 'OPS' })
        .expect(409);
      expect(dup.body.error.code).toBe('ADMIN_EMAIL_IN_USE');

      // First login: 2FA setup, then everything but password change is blocked.
      const step1 = await login(email, temp).expect(200);
      const setup = await http(app)
        .post('/v1/admin/auth/2fa/setup')
        .send({ mfaToken: step1.body.mfaToken })
        .expect(200);
      const secret = new URL(setup.body.otpauthUrl).searchParams.get('secret')!;
      const session = await http(app)
        .post('/v1/admin/auth/2fa/verify')
        .send({ mfaToken: step1.body.mfaToken, code: await generate({ secret }) })
        .expect(200);
      const token = session.body.accessToken as string;

      const blocked = await http(app).get('/v1/admin/users').set(bearer(token)).expect(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
      await http(app).get('/v1/admin/me').set(bearer(token)).expect(200);

      const short = await http(app)
        .post('/v1/admin/me/password')
        .set(bearer(token))
        .send({ currentPassword: temp, newPassword: 'short' })
        .expect(400);
      expect(short.body.error.code).toBe('VALIDATION_FAILED');

      await http(app)
        .post('/v1/admin/me/password')
        .set(bearer(token))
        .send({ currentPassword: temp, newPassword: 'a much better passphrase' })
        .expect(200);
      await http(app).get('/v1/admin/users').set(bearer(token)).expect(200);

      expect(
        await prisma.auditLog.count({
          where: {
            actorId: root.id,
            action: 'admin.admins.create',
            targetId: created.body.admin.id,
          },
        }),
      ).toBe(1);
    });

    it("can't change own role or status; disabling another admin signs them out", async () => {
      const root = await createAdmin(app, 'SUPER_ADMIN');
      const rootSession = await loginAdmin(app, root);
      const self = await http(app)
        .patch(`/v1/admin/admins/${root.id}`)
        .set(bearer(rootSession.accessToken))
        .send({ role: 'OPS' })
        .expect(400);
      expect(self.body.error.code).toBe('CANNOT_MODIFY_SELF');

      const ops = await createAdmin(app, 'OPS');
      const opsSession = await loginAdmin(app, ops);
      const res = await http(app)
        .patch(`/v1/admin/admins/${ops.id}`)
        .set(bearer(rootSession.accessToken))
        .send({ status: 'DISABLED' })
        .expect(200);
      expect(res.body.status).toBe('DISABLED');
      await http(app).get('/v1/admin/me').set(bearer(opsSession.accessToken)).expect(401);
    });

    it('lists and searches app users with cursor pagination', async () => {
      const admin = await createAdmin(app, 'SUPPORT');
      const { accessToken } = await loginAdmin(app, admin);
      const users = [];
      for (let i = 0; i < 3; i++) users.push(await loginUser(app, sms, uniquePhone()));

      const page1 = await http(app)
        .get('/v1/admin/users?limit=2')
        .set(bearer(accessToken))
        .expect(200);
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.nextCursor).toEqual(expect.any(String));
      const page2 = await http(app)
        .get(`/v1/admin/users?limit=2&cursor=${page1.body.nextCursor}`)
        .set(bearer(accessToken))
        .expect(200);
      expect(page2.body.items[0].id).not.toBe(page1.body.items[1].id);

      const target = users[1]!;
      const found = await http(app)
        .get(`/v1/admin/users?search=${encodeURIComponent(target.phone.slice(-6))}`)
        .set(bearer(accessToken))
        .expect(200);
      expect(found.body.items.map((u: { id: string }) => u.id)).toContain(target.userId);
    });
  });
});
