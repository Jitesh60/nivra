import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { Prisma, UserStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { userViewInclude, type UserView } from '../users/user-view.js';

export type UserAction = 'suspend' | 'ban' | 'reactivate';

const NEXT_STATUS: Record<UserAction, { from: UserStatus[]; to: UserStatus }> = {
  suspend: { from: ['ACTIVE'], to: 'SUSPENDED' },
  ban: { from: ['ACTIVE', 'SUSPENDED'], to: 'BANNED' },
  reactivate: { from: ['SUSPENDED', 'BANNED'], to: 'ACTIVE' },
};

/** App users as seen from the admin panel. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  /** Everything the user detail page shows. */
  async detail(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: userViewInclude() });
    if (!user) throw new AppException(ErrorCode.NOT_FOUND, 'User not found', HttpStatus.NOT_FOUND);
    const [documents, activeSessions, activity] = await Promise.all([
      this.prisma.userDocument.findMany({
        where: { userId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.session.count({
        where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
      this.prisma.auditLog.findMany({
        where: { OR: [{ targetId: id }, { actorType: 'USER', actorId: id }] },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return { user, documents, activeSessions, activity };
  }

  /** Suspend or ban (signs the user out everywhere) or reactivate, with a reason. */
  async setStatus(
    adminId: string,
    id: string,
    action: UserAction,
    reason: string,
    client: ClientInfo,
  ): Promise<void> {
    const { from, to } = NEXT_STATUS[action];
    const { count } = await this.prisma.user.updateMany({
      where: { id, status: { in: from } },
      data: { status: to },
    });
    if (count === 0) {
      const exists = await this.prisma.user.findUnique({ where: { id }, select: { status: true } });
      if (!exists)
        throw new AppException(ErrorCode.NOT_FOUND, 'User not found', HttpStatus.NOT_FOUND);
      throw new AppException(
        ErrorCode.USER_STATUS_CONFLICT,
        `Can't ${action} a user who is ${exists.status.toLowerCase()}`,
        HttpStatus.CONFLICT,
      );
    }
    if (to !== 'ACTIVE') await this.sessions.revokeAll('USER', id, `admin_${action}`);
    await this.audit.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: `admin.user.${action}`,
      targetType: 'user',
      targetId: id,
      metadata: { reason },
      ip: client.ip,
    });
  }

  async list(query: {
    search?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: UserView[]; nextCursor: string | null }> {
    const search = query.search;
    const digits = search?.replace(/\D/g, '');
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            ...(digits ? [{ phone: { contains: digits } }] : []),
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    // Newest first. IDs are UUID v7, so ordering by id is ordering by creation time.
    const rows = await this.prisma.user.findMany({
      where: { ...where, ...(query.cursor ? { id: { lt: query.cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: userViewInclude(),
    });
    const items = rows.slice(0, query.limit);
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }
}
