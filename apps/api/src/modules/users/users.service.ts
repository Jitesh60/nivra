import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionsService } from '../sessions/sessions.service.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  get(userId: string): Promise<User> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  }

  updateName(userId: string, name: string): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { name } });
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId, realm: 'USER', revokedAt: null },
    });
    if (!session) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Session not found', HttpStatus.NOT_FOUND);
    }
    await this.sessions.revoke(session.id, 'revoked_by_user');
  }

  /**
   * Account deletion (Play Store / App Store requirement, DPDP right to erasure).
   * The row is kept for referential integrity, but personal data is removed and the
   * phone number is freed, so signing in again creates a brand-new account.
   */
  async deleteAccount(userId: string, client: ClientInfo): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          phone: `deleted:${userId}`,
          phoneVerifiedAt: null,
          email: null,
          emailVerifiedAt: null,
          name: null,
        },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'account_deleted' },
      });
      await this.audit.log(
        { actorType: 'USER', actorId: userId, action: 'user.account.delete', ip: client.ip },
        tx,
      );
    });
  }
}
