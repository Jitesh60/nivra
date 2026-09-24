import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { hmacSha256, randomDigits, safeEqualHex } from '../../common/crypto/crypto.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Env } from '../../config/env.js';
import type { OtpChallenge, OtpChannel, OtpPurpose } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REDIS } from '../../redis/redis.module.js';

/** Limits from docs/ARCHITECTURE.md §4.1. */
export const OTP_LIMITS = {
  codeLength: 6,
  ttlSec: 5 * 60,
  maxAttempts: 5,
  resendCooldownSec: 30,
  requestsPerTargetPerHour: 5,
  requestsPerIpPerHour: 20,
  failuresPerTargetPerHour: 10,
  lockSec: 60 * 60,
} as const;

const HOUR = 60 * 60;

export interface IssueOtpParams {
  channel: OtpChannel;
  purpose: OtpPurpose;
  /** E.164 phone or lower-cased email. */
  target: string;
  userId?: string;
  ip?: string;
  /** Sends the code. If it throws, the challenge is cancelled and the cooldown cleared. */
  deliver: (code: string) => Promise<void>;
}

export interface IssuedOtp {
  challengeId: string;
  expiresInSec: number;
  resendAfterSec: number;
}

export interface VerifyOtpParams {
  challengeId: string;
  code: string;
  purpose: OtpPurpose;
  /** When set, the challenge must belong to this user. */
  userId?: string;
}

export const otpKeys = {
  cooldown: (purpose: OtpPurpose, target: string) => `otp:cooldown:${purpose}:${target}`,
  targetRequests: (target: string) => `otp:req:target:${target}`,
  ipRequests: (ip: string) => `otp:req:ip:${ip}`,
  targetFailures: (target: string) => `otp:fail:${target}`,
  lock: (target: string) => `otp:lock:${target}`,
};

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly pepper: string;
  private readonly bypassCode?: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.pepper = config.get('OTP_PEPPER', { infer: true });
    this.bypassCode = config.get('OTP_DEV_BYPASS_CODE', { infer: true });
  }

  async issue(params: IssueOtpParams): Promise<IssuedOtp> {
    const { target, purpose } = params;
    await this.assertNotLocked(target);

    const cooldownKey = otpKeys.cooldown(purpose, target);
    const set = await this.redis.set(cooldownKey, '1', 'EX', OTP_LIMITS.resendCooldownSec, 'NX');
    if (set !== 'OK') {
      const ttl = await this.redis.ttl(cooldownKey);
      throw this.tooManyRequests(
        ErrorCode.OTP_COOLDOWN,
        'Please wait before requesting another code',
        ttl,
      );
    }

    await this.countOrThrow(otpKeys.targetRequests(target), OTP_LIMITS.requestsPerTargetPerHour);
    if (params.ip) {
      await this.countOrThrow(otpKeys.ipRequests(params.ip), OTP_LIMITS.requestsPerIpPerHour);
    }

    // A new code replaces any earlier open code for the same target and purpose.
    const now = new Date();
    await this.prisma.otpChallenge.updateMany({
      where: { target, purpose, consumedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });

    const code = randomDigits(OTP_LIMITS.codeLength);
    const challenge = await this.prisma.otpChallenge.create({
      data: {
        channel: params.channel,
        purpose,
        target,
        userId: params.userId,
        codeHash: this.hash(target, code),
        maxAttempts: OTP_LIMITS.maxAttempts,
        expiresAt: new Date(now.getTime() + OTP_LIMITS.ttlSec * 1000),
      },
    });

    try {
      await params.deliver(code);
    } catch (err) {
      this.logger.error(`OTP delivery failed for challenge ${challenge.id}: ${String(err)}`);
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { expiresAt: new Date() },
      });
      await this.redis.del(cooldownKey);
      throw new AppException(
        ErrorCode.OTP_DELIVERY_FAILED,
        'We could not send the code. Please try again.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      challengeId: challenge.id,
      expiresInSec: OTP_LIMITS.ttlSec,
      resendAfterSec: OTP_LIMITS.resendCooldownSec,
    };
  }

  /** Verifies a code and consumes the challenge. Returns the consumed challenge. */
  async verify(params: VerifyOtpParams): Promise<OtpChallenge> {
    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { id: params.challengeId },
    });
    if (
      !challenge ||
      challenge.purpose !== params.purpose ||
      (params.userId !== undefined && challenge.userId !== params.userId)
    ) {
      throw new AppException(
        ErrorCode.OTP_INVALID,
        'The code is incorrect',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertNotLocked(challenge.target);

    if (challenge.consumedAt || challenge.expiresAt <= new Date()) {
      throw this.expired();
    }

    // Count the attempt *before* comparing, atomically, so parallel guesses
    // can never exceed maxAttempts.
    const counted = await this.prisma.otpChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: challenge.maxAttempts },
      },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) {
      const fresh = await this.prisma.otpChallenge.findUniqueOrThrow({
        where: { id: challenge.id },
      });
      if (fresh.attempts >= fresh.maxAttempts) throw this.tooManyAttempts();
      throw this.expired();
    }

    if (!this.matches(challenge, params.code)) {
      await this.recordFailure(challenge.target);
      const attemptsLeft = challenge.maxAttempts - (challenge.attempts + 1);
      if (attemptsLeft <= 0) throw this.tooManyAttempts();
      throw new AppException(
        ErrorCode.OTP_INVALID,
        'The code is incorrect',
        HttpStatus.BAD_REQUEST,
        {
          attemptsLeft,
        },
      );
    }

    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) throw this.expired();
    return challenge;
  }

  private hash(target: string, code: string): string {
    return hmacSha256(`${target}:${code}`, this.pepper);
  }

  private matches(challenge: OtpChallenge, code: string): boolean {
    if (this.bypassCode && code === this.bypassCode) return true;
    return safeEqualHex(this.hash(challenge.target, code), challenge.codeHash);
  }

  private async assertNotLocked(target: string): Promise<void> {
    const ttl = await this.redis.ttl(otpKeys.lock(target));
    if (ttl > 0) {
      throw this.tooManyRequests(
        ErrorCode.OTP_RATE_LIMITED,
        'Too many attempts. Please try again later.',
        ttl,
      );
    }
  }

  private async countOrThrow(key: string, limit: number): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, HOUR);
    if (count > limit) {
      const ttl = await this.redis.ttl(key);
      throw this.tooManyRequests(
        ErrorCode.OTP_RATE_LIMITED,
        'Too many codes requested. Please try again later.',
        ttl,
      );
    }
  }

  private async recordFailure(target: string): Promise<void> {
    const key = otpKeys.targetFailures(target);
    const failures = await this.redis.incr(key);
    if (failures === 1) await this.redis.expire(key, HOUR);
    if (failures >= OTP_LIMITS.failuresPerTargetPerHour) {
      await this.redis.set(otpKeys.lock(target), '1', 'EX', OTP_LIMITS.lockSec);
      await this.redis.del(key);
    }
  }

  private tooManyRequests(code: ErrorCode, message: string, retryAfterSec: number) {
    return new AppException(code, message, HttpStatus.TOO_MANY_REQUESTS, {
      retryAfterSec: Math.max(retryAfterSec, 1),
    });
  }

  private expired() {
    return new AppException(
      ErrorCode.OTP_EXPIRED,
      'This code has expired. Please request a new one.',
      HttpStatus.BAD_REQUEST,
    );
  }

  private tooManyAttempts() {
    return new AppException(
      ErrorCode.OTP_TOO_MANY_ATTEMPTS,
      'Too many incorrect attempts. Please request a new code.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
