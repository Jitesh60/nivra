import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { Prisma, type User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailProvider } from '../../providers/email/email.provider.js';
import { emailOtpMessage } from '../../providers/email/templates.js';
import { SmsProvider } from '../../providers/sms/sms.provider.js';
import { OTP_LIMITS, OtpService, type IssuedOtp } from '../otp/otp.service.js';
import { normalizeIndianMobile } from '../otp/phone.js';
import { suspended, SessionsService, type DeviceInfo } from '../sessions/sessions.service.js';
import { TokenService } from '../sessions/token.service.js';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokenService,
    private readonly sms: SmsProvider,
    private readonly email: EmailProvider,
  ) {}

  async requestPhoneOtp(rawPhone: string, client: ClientInfo): Promise<IssuedOtp> {
    const phone = normalizeIndianMobile(rawPhone);
    if (!phone) {
      throw new AppException(
        ErrorCode.PHONE_INVALID,
        'Enter a valid 10-digit Indian mobile number',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.otp.issue({
      channel: 'SMS',
      purpose: 'LOGIN',
      target: phone,
      ip: client.ip,
      deliver: (code) => this.sms.sendOtp(phone, code),
    });
  }

  /** Signs in (or signs up) with a phone code. */
  async verifyPhoneOtp(
    input: { challengeId: string; code: string } & DeviceInfo,
    client: ClientInfo,
  ): Promise<Tokens & { isNewUser: boolean; user: User }> {
    const challenge = await this.otp.verify({
      challengeId: input.challengeId,
      code: input.code,
      purpose: 'LOGIN',
    });

    const phone = challenge.target;
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing && existing.status !== 'ACTIVE') throw suspended();

    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: { phoneVerifiedAt: existing.phoneVerifiedAt ?? new Date() },
        })
      : await this.createUser(phone);

    const tokens = await this.startSession(user.id, client, input);
    return { ...tokens, isNewUser: !existing, user };
  }

  async refresh(refreshToken: string, client: ClientInfo): Promise<Tokens> {
    const rotated = await this.sessions.rotate('USER', refreshToken, client);
    const access = this.tokens.signAccess('USER', rotated.subjectId, rotated.sessionId);
    return {
      accessToken: access.token,
      refreshToken: rotated.refreshToken,
      expiresInSec: access.expiresInSec,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId, 'logout');
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessions.revokeAll('USER', userId, 'logout_all');
  }

  async requestEmailOtp(userId: string, email: string, client: ClientInfo): Promise<IssuedOtp> {
    await this.assertEmailAvailable(userId, email);
    return this.otp.issue({
      channel: 'EMAIL',
      purpose: 'VERIFY_EMAIL',
      target: email,
      userId,
      ip: client.ip,
      deliver: (code) => this.email.send(emailOtpMessage(email, code, OTP_LIMITS.ttlSec / 60)),
    });
  }

  async verifyEmailOtp(userId: string, challengeId: string, code: string): Promise<User> {
    const challenge = await this.otp.verify({ challengeId, code, purpose: 'VERIFY_EMAIL', userId });
    await this.assertEmailAvailable(userId, challenge.target);
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { email: challenge.target, emailVerifiedAt: new Date() },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw emailInUse();
      }
      throw err;
    }
  }

  private async createUser(phone: string): Promise<User> {
    try {
      return await this.prisma.user.create({ data: { phone, phoneVerifiedAt: new Date() } });
    } catch (err) {
      // Two first-logins for the same number at once: the other request created the user.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.prisma.user.findUniqueOrThrow({ where: { phone } });
      }
      throw err;
    }
  }

  private async startSession(
    userId: string,
    client: ClientInfo,
    device: DeviceInfo,
  ): Promise<Tokens> {
    const { session, refreshToken } = await this.sessions.create('USER', userId, client, device);
    const access = this.tokens.signAccess('USER', userId, session.id);
    return { accessToken: access.token, refreshToken, expiresInSec: access.expiresInSec };
  }

  private async assertEmailAvailable(userId: string, email: string): Promise<void> {
    const owner = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (owner && owner.id !== userId) throw emailInUse();
  }
}

function emailInUse(): AppException {
  return new AppException(
    ErrorCode.EMAIL_IN_USE,
    'This email is already linked to another account',
    HttpStatus.CONFLICT,
  );
}
