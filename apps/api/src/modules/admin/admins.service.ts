import { HttpStatus, Injectable } from '@nestjs/common';
import { randomToken } from '../../common/crypto/crypto.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import {
  Prisma,
  type AdminRole,
  type AdminStatus,
  type AdminUser,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashPassword } from '../admin-auth/password.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionsService } from '../sessions/sessions.service.js';

@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<AdminUser[]> {
    return this.prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
  }

  /** Invites an admin with a one-time temporary password (must be changed at first login). */
  async create(
    actorId: string,
    input: { email: string; name: string; role: AdminRole },
    client: ClientInfo,
  ): Promise<{ admin: AdminUser; temporaryPassword: string }> {
    const temporaryPassword = randomToken(12);
    try {
      const admin = await this.prisma.adminUser.create({
        data: {
          ...input,
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
        },
      });
      await this.audit.log({
        actorType: 'ADMIN',
        actorId,
        action: 'admin.admins.create',
        targetType: 'admin_user',
        targetId: admin.id,
        metadata: { email: admin.email, role: admin.role },
        ip: client.ip,
      });
      return { admin, temporaryPassword };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(
          ErrorCode.ADMIN_EMAIL_IN_USE,
          'An admin with this email already exists',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  async update(
    actorId: string,
    id: string,
    input: { name?: string; role?: AdminRole; status?: AdminStatus },
    client: ClientInfo,
  ): Promise<AdminUser> {
    if (id === actorId && (input.role !== undefined || input.status !== undefined)) {
      throw new AppException(
        ErrorCode.CANNOT_MODIFY_SELF,
        "You can't change your own role or status",
        HttpStatus.BAD_REQUEST,
      );
    }
    const existing = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!existing)
      throw new AppException(ErrorCode.NOT_FOUND, 'Admin not found', HttpStatus.NOT_FOUND);

    const admin = await this.prisma.adminUser.update({ where: { id }, data: input });
    if (input.status === 'DISABLED' && existing.status !== 'DISABLED') {
      await this.sessions.revokeAll('ADMIN', id, 'admin_disabled');
    }
    await this.audit.log({
      actorType: 'ADMIN',
      actorId,
      action: 'admin.admins.update',
      targetType: 'admin_user',
      targetId: id,
      metadata: { ...input },
      ip: client.ip,
    });
    return admin;
  }
}
