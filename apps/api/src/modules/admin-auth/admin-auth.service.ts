import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decrypt, encrypt } from '../../common/crypto/crypto.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { Env } from '../../config/env.js';
import type { AdminUser } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { suspended, SessionsService } from '../sessions/sessions.service.js';
import { TokenService } from '../sessions/token.service.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from './password.js';
import {
  hashRecoveryCode,
  newRecoveryCodes,
  newTotpSecret,
  totpProvisioning,
  verifyTotp,
} from './totp.js';

export const ADMIN_LOCKOUT = { maxFailures: 5, lockMinutes: 15 } as const;

export interface AdminSessionResult {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  admin: AdminUser;
  recoveryCodes?: string[];
}

@Injectable()
export class AdminAuthService {
  private readonly totpKey: Buffer;
  private readonly totpIssuer: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.totpKey = Buffer.from(config.get('TOTP_ENC_KEY', { infer: true }), 'base64');
    this.totpIssuer = config.get('TOTP_ISSUER', { infer: true });
  }

  /** Step 1: email + password. Never returns tokens, only a short-lived 2FA token. */
  async login(email: string, password: string, client: ClientInfo) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!admin) {
      await verifyPassword(await dummyPasswordHash(), password);
      await this.audit.log({
        actorType: 'ADMIN',
        action: 'admin.login.failed',
        metadata: { reason: 'unknown_email' },
        ip: client.ip,
      });
      throw invalidCredentials();
    }
    this.assertNotLocked(admin);

    if (!(await verifyPassword(admin.passwordHash, password))) {
      await this.recordFailure(admin, 'wrong_password', client);
      throw invalidCredentials();
    }
    if (admin.status !== 'ACTIVE') throw suspended();

    return {
      mfaToken: this.tokens.signAdminMfa(admin.id).token,
      mfaSetupRequired: admin.totpEnabledAt === null,
    };
  }

  /** Step 2a (first login only): create a TOTP secret and return the QR code. */
  async setupTwoFactor(mfaToken: string) {
    const admin = await this.adminFromMfaToken(mfaToken);
    if (admin.totpEnabledAt) {
      throw new AppException(
        ErrorCode.MFA_ALREADY_ENABLED,
        'Two-factor authentication is already set up',
        HttpStatus.CONFLICT,
      );
    }
    const secret = newTotpSecret();
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { totpSecretEnc: encrypt(secret, this.totpKey) },
    });
    return totpProvisioning(secret, this.totpIssuer, admin.email);
  }

  /** Step 2b: authenticator code (or recovery code) → session tokens. */
  async verifyTwoFactor(
    mfaToken: string,
    input: { code?: string; recoveryCode?: string },
    client: ClientInfo,
  ): Promise<AdminSessionResult> {
    const admin = await this.adminFromMfaToken(mfaToken);
    this.assertNotLocked(admin);
    if (admin.status !== 'ACTIVE') throw suspended();

    if (!admin.totpEnabledAt) return this.enableTwoFactor(admin, input.code, client);

    if (input.recoveryCode) {
      const used = await this.prisma.adminRecoveryCode.updateMany({
        where: {
          adminUserId: admin.id,
          codeHash: hashRecoveryCode(input.recoveryCode),
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
      if (used.count === 0) return this.failMfa(admin, client);
      await this.audit.log({
        actorType: 'ADMIN',
        actorId: admin.id,
        action: 'admin.2fa.recovery_code_used',
        ip: client.ip,
      });
      return this.completeLogin(admin, client, {});
    }

    const step = input.code
      ? await verifyTotp(this.totpSecret(admin), input.code, admin.totpLastTimeStep)
      : null;
    if (step === null) return this.failMfa(admin, client);
    return this.completeLogin(admin, client, { totpLastTimeStep: step });
  }

  async refresh(refreshToken: string, client: ClientInfo) {
    const rotated = await this.sessions.rotate('ADMIN', refreshToken, client);
    const access = this.tokens.signAccess('ADMIN', rotated.subjectId, rotated.sessionId);
    return {
      accessToken: access.token,
      refreshToken: rotated.refreshToken,
      expiresInSec: access.expiresInSec,
    };
  }

  async logout(adminId: string, sessionId: string, client: ClientInfo): Promise<void> {
    await this.sessions.revoke(sessionId, 'logout');
    await this.audit.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.logout',
      ip: client.ip,
    });
  }

  me(adminId: string): Promise<AdminUser> {
    return this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
  }

  /** Changes the password and signs out every other session. */
  async changePassword(
    adminId: string,
    sessionId: string,
    current: string,
    next: string,
    client: ClientInfo,
  ): Promise<AdminUser> {
    const admin = await this.me(adminId);
    if (!(await verifyPassword(admin.passwordHash, current))) throw invalidCredentials();
    if (current === next) {
      throw new AppException(
        ErrorCode.PASSWORD_REUSED,
        'Choose a password different from the current one',
        HttpStatus.BAD_REQUEST,
      );
    }
    const updated = await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { passwordHash: await hashPassword(next), mustChangePassword: false },
    });
    await this.sessions.revokeAll('ADMIN', adminId, 'password_changed', sessionId);
    await this.audit.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.password.change',
      ip: client.ip,
    });
    return updated;
  }

  private async enableTwoFactor(
    admin: AdminUser,
    code: string | undefined,
    client: ClientInfo,
  ): Promise<AdminSessionResult> {
    if (!admin.totpSecretEnc) {
      throw new AppException(
        ErrorCode.MFA_SETUP_REQUIRED,
        'Set up your authenticator app first',
        HttpStatus.BAD_REQUEST,
      );
    }
    const step = code ? await verifyTotp(this.totpSecret(admin), code) : null;
    if (step === null) return this.failMfa(admin, client);

    const recoveryCodes = newRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.adminRecoveryCode.deleteMany({ where: { adminUserId: admin.id } }),
      this.prisma.adminRecoveryCode.createMany({
        data: recoveryCodes.map((c) => ({ adminUserId: admin.id, codeHash: hashRecoveryCode(c) })),
      }),
    ]);
    await this.audit.log({
      actorType: 'ADMIN',
      actorId: admin.id,
      action: 'admin.2fa.enable',
      ip: client.ip,
    });
    const result = await this.completeLogin(admin, client, {
      totpEnabledAt: new Date(),
      totpLastTimeStep: step,
    });
    return { ...result, recoveryCodes };
  }

  private async completeLogin(
    admin: AdminUser,
    client: ClientInfo,
    extra: { totpEnabledAt?: Date; totpLastTimeStep?: number },
  ): Promise<AdminSessionResult> {
    const updated = await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { ...extra, failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const { session, refreshToken } = await this.sessions.create('ADMIN', admin.id, client);
    const access = this.tokens.signAccess('ADMIN', admin.id, session.id);
    await this.audit.log({
      actorType: 'ADMIN',
      actorId: admin.id,
      action: 'admin.login',
      ip: client.ip,
    });
    return {
      accessToken: access.token,
      refreshToken,
      expiresInSec: access.expiresInSec,
      admin: updated,
    };
  }

  private async failMfa(admin: AdminUser, client: ClientInfo): Promise<never> {
    await this.recordFailure(admin, 'wrong_2fa_code', client);
    throw new AppException(ErrorCode.MFA_INVALID, 'The code is incorrect', HttpStatus.UNAUTHORIZED);
  }

  /** Wrong passwords and wrong 2FA codes share one counter: 5 → locked for 15 minutes. */
  private async recordFailure(admin: AdminUser, reason: string, client: ClientInfo): Promise<void> {
    const failures = admin.failedLoginCount + 1;
    const lock = failures >= ADMIN_LOCKOUT.maxFailures;
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: lock
        ? {
            failedLoginCount: 0,
            lockedUntil: new Date(Date.now() + ADMIN_LOCKOUT.lockMinutes * 60_000),
          }
        : { failedLoginCount: failures },
    });
    await this.audit.log({
      actorType: 'ADMIN',
      actorId: admin.id,
      action: lock ? 'admin.login.locked' : 'admin.login.failed',
      metadata: { reason },
      ip: client.ip,
    });
  }

  private assertNotLocked(admin: AdminUser): void {
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new AppException(
        ErrorCode.ACCOUNT_LOCKED,
        'Too many failed attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfterSec: Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 1000) },
      );
    }
  }

  private async adminFromMfaToken(mfaToken: string): Promise<AdminUser> {
    const claims = this.tokens.verify(mfaToken, 'admin_mfa');
    const admin = await this.prisma.adminUser.findUnique({ where: { id: claims.sub } });
    if (!admin) throw invalidCredentials();
    return admin;
  }

  private totpSecret(admin: AdminUser): string {
    return decrypt(admin.totpSecretEnc!, this.totpKey);
  }
}

function invalidCredentials(): AppException {
  return new AppException(
    ErrorCode.INVALID_CREDENTIALS,
    'Email or password is incorrect',
    HttpStatus.UNAUTHORIZED,
  );
}
