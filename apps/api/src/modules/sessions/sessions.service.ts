import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomToken, sha256 } from '../../common/crypto/crypto.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { Env } from '../../config/env.js';
import type { AuthRealm, Session } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { invalidToken } from './token.service.js';

export interface DeviceInfo {
  deviceId?: string;
  deviceName?: string;
  platform?: string;
}

export interface CreatedSession {
  session: Session;
  refreshToken: string;
}

export interface RotatedSession {
  sessionId: string;
  subjectId: string;
  refreshToken: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Device sessions and rotating refresh tokens for both realms.
 *
 * - Users: 30-day sliding sessions (each refresh extends the session).
 * - Admins: 12-hour fixed sessions (refresh never extends past login + 12h).
 * - Every refresh issues a new token and marks the old one used. Presenting a used
 *   token means it was copied, so the whole session is revoked (REFRESH_REUSED).
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async create(
    realm: AuthRealm,
    subjectId: string,
    client: ClientInfo,
    device: DeviceInfo = {},
  ): Promise<CreatedSession> {
    const expiresAt = new Date(Date.now() + this.lifetimeMs(realm));
    const refreshToken = randomToken();
    const session = await this.prisma.session.create({
      data: {
        realm,
        ...(realm === 'USER' ? { userId: subjectId } : { adminUserId: subjectId }),
        deviceId: device.deviceId,
        deviceName: device.deviceName ?? client.userAgent?.slice(0, 120),
        platform: device.platform,
        ip: client.ip,
        userAgent: client.userAgent,
        expiresAt,
        refreshTokens: { create: { tokenHash: sha256(refreshToken), expiresAt } },
      },
    });
    return { session, refreshToken };
  }

  async rotate(
    realm: AuthRealm,
    refreshToken: string,
    client: ClientInfo,
  ): Promise<RotatedSession> {
    const presented = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { session: { include: { user: true, adminUser: true } } },
    });
    if (!presented || presented.session.realm !== realm) throw invalidToken();

    const { session } = presented;
    if (session.revokedAt) throw invalidToken();

    if (presented.usedAt) {
      await this.revoke(session.id, 'refresh_reuse');
      this.logger.warn(`Refresh token reuse detected; revoked session ${session.id}`);
      throw reused();
    }

    const now = new Date();
    if (presented.expiresAt <= now || session.expiresAt <= now) {
      throw new AppException(ErrorCode.TOKEN_EXPIRED, 'Session expired', HttpStatus.UNAUTHORIZED);
    }

    const subjectActive =
      realm === 'USER' ? session.user?.status === 'ACTIVE' : session.adminUser?.status === 'ACTIVE';
    if (!subjectActive) {
      await this.revoke(session.id, 'account_inactive');
      throw suspended();
    }

    const expiresAt =
      realm === 'USER' ? new Date(now.getTime() + this.lifetimeMs(realm)) : session.expiresAt;
    const next = randomToken();

    await this.prisma
      .$transaction(async (tx) => {
        // Guard against two concurrent refreshes with the same token: only one wins.
        const marked = await tx.refreshToken.updateMany({
          where: { id: presented.id, usedAt: null },
          data: { usedAt: now },
        });
        if (marked.count === 0) throw reused();
        await tx.refreshToken.create({
          data: { sessionId: session.id, tokenHash: sha256(next), expiresAt },
        });
        await tx.session.update({
          where: { id: session.id },
          data: { expiresAt, lastUsedAt: now, ip: client.ip ?? session.ip },
        });
      })
      .catch(async (err: unknown) => {
        if (err instanceof AppException && err.code === ErrorCode.REFRESH_REUSED) {
          await this.revoke(session.id, 'refresh_reuse');
        }
        throw err;
      });

    return {
      sessionId: session.id,
      subjectId: (session.userId ?? session.adminUserId)!,
      refreshToken: next,
    };
  }

  /** Active (not revoked, not expired) session, for access-token guards. */
  async findActive(sessionId: string, realm: AuthRealm) {
    return this.prisma.session.findFirst({
      where: { id: sessionId, realm, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true, adminUser: true },
    });
  }

  async listActive(realm: AuthRealm, subjectId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: {
        realm,
        ...(realm === 'USER' ? { userId: subjectId } : { adminUserId: subjectId }),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async revoke(sessionId: string, reason: string): Promise<boolean> {
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return count > 0;
  }

  /** Revokes every session of a subject, optionally keeping one (e.g. the current device). */
  async revokeAll(
    realm: AuthRealm,
    subjectId: string,
    reason: string,
    exceptSessionId?: string,
  ): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: {
        realm,
        ...(realm === 'USER' ? { userId: subjectId } : { adminUserId: subjectId }),
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return count;
  }

  private lifetimeMs(realm: AuthRealm): number {
    return realm === 'USER'
      ? this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * DAY_MS
      : this.config.get('ADMIN_REFRESH_TOKEN_TTL_HOURS', { infer: true }) * HOUR_MS;
  }
}

function reused(): AppException {
  return new AppException(
    ErrorCode.REFRESH_REUSED,
    'This refresh token was already used. Please sign in again.',
    HttpStatus.UNAUTHORIZED,
  );
}

export function suspended(): AppException {
  return new AppException(
    ErrorCode.ACCOUNT_SUSPENDED,
    'This account is suspended.',
    HttpStatus.FORBIDDEN,
  );
}
