import { randomInt } from 'node:crypto';
import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { Env } from '../../config/env.js';
import { type CreditEntry, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RateLimiter } from '../../redis/rate-limiter.js';
import { AuditService } from '../audit/audit.service.js';
import { BookingStateMachine, type Transition } from '../bookings/booking-state-machine.js';
import { rupees } from '../chat/chat-presenter.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ParticipantPresenter } from '../safety/participants.js';
import { userViewInclude } from '../users/user-view.js';
import { creditBalance, lockCredit, REFERRAL_RULES as R } from './credits.js';
import type {
  AdminReferralDto,
  CreditEntryDto,
  MyReferralDto,
  ReferralCodeLookupDto,
} from './dto/referral.dto.js';

/** No 0/O, 1/I/L: easy to read out and type. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const DAY_MS = 24 * 3600 * 1000;

function newCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

/**
 * Invite codes and referral credit (Phase 10). A new person who enters a
 * code gets ₹100 of credit; the inviter gets ₹100 once that person's first
 * rental completes. Credit comes off rent at booking time (see credits.ts).
 */
@Injectable()
export class ReferralsService implements OnModuleInit {
  private readonly siteUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: RateLimiter,
    private readonly machine: BookingStateMachine,
    private readonly notifications: NotificationsService,
    private readonly participants: ParticipantPresenter,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.siteUrl = config.get('PUBLIC_SITE_URL', { infer: true }).replace(/\/$/, '');
  }

  onModuleInit(): void {
    this.machine.onTransition((t) => this.onBookingChanged(t));
  }

  /**
   * Public lookup for the website's invite page. Only the first name is
   * shown, and an unknown, suspended or deleted owner reads as not valid
   * (never a 404), so the endpoint can't be used to probe accounts.
   */
  async lookup(rawCode: string): Promise<ReferralCodeLookupDto> {
    const code = rawCode.replace(/[\s-]/g, '').toUpperCase();
    const owner = /^[A-Z0-9]{4,12}$/.test(code)
      ? await this.prisma.referralCode.findUnique({
          where: { code },
          select: { user: { select: { name: true, status: true, deletedAt: true } } },
        })
      : null;
    const active = owner && owner.user.status === 'ACTIVE' && !owner.user.deletedAt;
    return {
      valid: Boolean(active),
      inviterFirstName: active ? (owner.user.name?.trim().split(/\s+/)[0] ?? null) || null : null,
      refereeCreditPaise: R.refereeCreditPaise,
      redeemWithinDays: R.redeemWithinDays,
    };
  }

  /** Your code (created the first time), counts, balance and history. */
  async mine(userId: string, now = new Date()): Promise<MyReferralDto> {
    const code = await this.codeFor(userId);
    const [user, invited, rewarded, balance, entries, referral, eligible] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } }),
      this.prisma.referral.count({ where: { referrerId: userId } }),
      this.prisma.referral.count({ where: { referrerId: userId, rewardedAt: { not: null } } }),
      creditBalance(this.prisma, userId),
      this.prisma.creditEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.referral.findUnique({
        where: { refereeId: userId },
        include: { referrer: { include: userViewInclude() } },
      }),
      this.canRedeem(userId, now),
    ]);
    return {
      code,
      link: `${this.siteUrl}/r/${code}`,
      invited,
      rewarded,
      creditBalancePaise: balance,
      canRedeem: eligible,
      redeemBefore: eligible
        ? new Date(user.createdAt.getTime() + R.redeemWithinDays * DAY_MS)
        : null,
      referredBy: referral ? this.participants.present(referral.referrer) : null,
      entries: entries.map(toEntryDto),
      rules: {
        refereeCreditPaise: R.refereeCreditPaise,
        referrerCreditPaise: R.referrerCreditPaise,
        maxShareOfRentPct: R.maxShareOfRentBps / 100,
        maxReferrerRewards: R.maxReferrerRewards,
        redeemWithinDays: R.redeemWithinDays,
      },
    };
  }

  /** A new person enters someone's code: they get credit straight away. */
  async redeem(userId: string, rawCode: string, now = new Date()): Promise<MyReferralDto> {
    await this.limiter.hit({
      key: `referral:redeem:${userId}`,
      limit: 10,
      windowSec: 3600,
      message: 'Too many tries. Please try again in an hour.',
    });
    if (!(await this.canRedeem(userId, now))) {
      throw new AppException(
        ErrorCode.REFERRAL_NOT_ALLOWED,
        `Invite codes can be used once, within ${R.redeemWithinDays} days of joining and before your first booking`,
        HttpStatus.CONFLICT,
      );
    }
    const owner = await this.prisma.referralCode.findUnique({
      where: { code: rawCode },
      include: { user: { select: { status: true, deletedAt: true } } },
    });
    if (
      !owner ||
      owner.userId === userId ||
      owner.user.status !== 'ACTIVE' ||
      owner.user.deletedAt
    ) {
      throw new AppException(
        ErrorCode.REFERRAL_CODE_INVALID,
        'That invite code doesn’t work. Check it and try again.',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockCredit(tx, userId);
        await tx.referral.create({
          data: { refereeId: userId, referrerId: owner.userId, code: owner.code },
        });
        await tx.creditEntry.create({
          data: {
            userId,
            amountPaise: R.refereeCreditPaise,
            kind: 'GRANT_REFEREE',
            referralId: userId,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(
          ErrorCode.REFERRAL_NOT_ALLOWED,
          'You’ve already used an invite code',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
    const joined = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    await this.notifications.notify(
      owner.userId,
      {
        type: 'referral.joined',
        title: `${joined?.name?.split(' ')[0] ?? 'Someone'} joined with your invite`,
        body: `You’ll get ${rupees(R.referrerCreditPaise)} of credit when their first rental is done.`,
      },
      { push: false },
    );
    return this.mine(userId, now);
  }

  // ── Admin ──

  async adminGet(userId: string): Promise<AdminReferralDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new AppException(ErrorCode.NOT_FOUND, 'User not found', HttpStatus.NOT_FOUND);
    const [code, referral, invited, balance, entries] = await Promise.all([
      this.prisma.referralCode.findUnique({ where: { userId } }),
      this.prisma.referral.findUnique({
        where: { refereeId: userId },
        include: { referrer: { include: userViewInclude() } },
      }),
      this.prisma.referral.findMany({
        where: { referrerId: userId },
        include: { referee: { include: userViewInclude() } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      creditBalance(this.prisma, userId),
      this.prisma.creditEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      code: code?.code ?? null,
      referredBy: referral ? this.participants.present(referral.referrer) : null,
      invited: invited.map((r) => ({
        user: this.participants.present(r.referee),
        joinedAt: r.createdAt,
        rewardedAt: r.rewardedAt,
      })),
      creditBalancePaise: balance,
      entries: entries.map(toEntryDto),
    };
  }

  /** Takes unused credit away (abuse), with a reason; audited. */
  async revoke(
    adminId: string,
    userId: string,
    amountPaise: number,
    reason: string,
    client: ClientInfo,
  ): Promise<AdminReferralDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockCredit(tx, userId);
      const balance = await creditBalance(tx, userId);
      if (amountPaise > balance) {
        throw new AppException(
          ErrorCode.CREDIT_TOO_LARGE,
          `Only ${rupees(balance)} of credit is unused`,
          HttpStatus.BAD_REQUEST,
          { balancePaise: balance },
        );
      }
      await tx.creditEntry.create({
        data: { userId, amountPaise: -amountPaise, kind: 'REVOKE', adminId, reason },
      });
      await this.audit.log(
        {
          actorType: 'ADMIN',
          actorId: adminId,
          action: 'admin.credit.revoke',
          targetType: 'user',
          targetId: userId,
          metadata: { amountPaise, reason },
          ip: client.ip,
        },
        tx,
      );
    });
    return this.adminGet(userId);
  }

  // ── Rewards ──

  private async onBookingChanged(t: Transition): Promise<void> {
    if (t.booking.status === 'COMPLETED') await this.rewardReferrer(t.booking.borrowerId);
  }

  /**
   * The inviter's reward, once, when the person they invited completes a
   * rental (their first, since the reward is claimed then). Returns whether
   * credit was given.
   */
  async rewardReferrer(refereeId: string): Promise<boolean> {
    const referral = await this.prisma.referral.findUnique({
      where: { refereeId },
      include: { referrer: { select: { status: true, deletedAt: true } } },
    });
    if (!referral || referral.rewardedAt) return false;
    if (referral.referrer.status !== 'ACTIVE' || referral.referrer.deletedAt) return false;
    const granted = await this.prisma.$transaction(async (tx) => {
      await lockCredit(tx, referral.referrerId);
      const already = await tx.referral.count({
        where: { referrerId: referral.referrerId, rewardedAt: { not: null } },
      });
      if (already >= R.maxReferrerRewards) return false;
      // Claim it, so two completions at once can't both pay.
      const claimed = await tx.referral.updateMany({
        where: { refereeId, rewardedAt: null },
        data: { rewardedAt: new Date() },
      });
      if (claimed.count === 0) return false;
      await tx.creditEntry.create({
        data: {
          userId: referral.referrerId,
          amountPaise: R.referrerCreditPaise,
          kind: 'GRANT_REFERRER',
          referralId: refereeId,
        },
      });
      return true;
    });
    if (granted) {
      await this.notifications.notify(
        referral.referrerId,
        {
          type: 'referral.rewarded',
          title: `You’ve earned ${rupees(R.referrerCreditPaise)} of credit`,
          body: 'Someone you invited finished their first rental. It comes off your next booking.',
        },
        { push: true },
      );
    }
    return granted;
  }

  // ── Helpers ──

  /** Joined in the last 7 days, never used a code, never booked anything. */
  private async canRedeem(userId: string, now: Date): Promise<boolean> {
    const [user, used, bookings] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
      this.prisma.referral.count({ where: { refereeId: userId } }),
      this.prisma.booking.count({ where: { borrowerId: userId } }),
    ]);
    if (!user || used > 0 || bookings > 0) return false;
    return now.getTime() - user.createdAt.getTime() <= R.redeemWithinDays * DAY_MS;
  }

  private async codeFor(userId: string): Promise<string> {
    const existing = await this.prisma.referralCode.findUnique({ where: { userId } });
    if (existing) return existing.code;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return (await this.prisma.referralCode.create({ data: { userId, code: newCode() } })).code;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'))
          throw err;
        // Either this user's code was created at the same moment, or the code was taken.
        const again = await this.prisma.referralCode.findUnique({ where: { userId } });
        if (again) return again.code;
      }
    }
    // Five collisions in a row: the alphabet has 31^8 codes, so this means a bug.
    throw new Error(`Could not create a referral code for ${userId}`);
  }
}

function toEntryDto(e: CreditEntry): CreditEntryDto {
  return {
    id: e.id,
    kind: e.kind,
    amountPaise: e.amountPaise,
    bookingId: e.bookingId,
    reason: e.reason,
    createdAt: e.createdAt,
  };
}
