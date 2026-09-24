import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { processAvatar } from '../media/image-pipeline.js';
import { invalid, UploadsService } from '../media/uploads.service.js';
import { SessionsService } from '../sessions/sessions.service.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly storage: StorageService,
  ) {}

  /** Name lives on User; city and bio on Profile (created on first use). Empty strings clear. */
  async updateProfile(
    userId: string,
    input: { name?: string; city?: string; bio?: string },
  ): Promise<void> {
    const profile = {
      ...(input.city !== undefined ? { city: input.city || null } : {}),
      ...(input.bio !== undefined ? { bio: input.bio || null } : {}),
    };
    await this.prisma.$transaction([
      ...(input.name !== undefined
        ? [this.prisma.user.update({ where: { id: userId }, data: { name: input.name } })]
        : []),
      ...(Object.keys(profile).length
        ? [
            this.prisma.profile.upsert({
              where: { userId },
              create: { userId, ...profile },
              update: profile,
            }),
          ]
        : []),
    ]);
  }

  /** Turns an uploaded image into the 512×512 public avatar and replaces the old one. */
  async setAvatar(userId: string, uploadKey: string): Promise<void> {
    const bytes = await this.uploads.claim(userId, uploadKey, 'AVATAR');
    let avatar: Buffer;
    try {
      avatar = await processAvatar(bytes);
    } catch {
      throw invalid('That image could not be read. Try a different photo.');
    } finally {
      await this.uploads.discard(uploadKey);
    }

    const key = `avatars/${userId}/${randomUUID()}.webp`;
    await this.storage.put('public', key, avatar, 'image/webp');
    const previous = await this.prisma.profile.findUnique({
      where: { userId },
      select: { avatarKey: true },
    });
    await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, avatarKey: key },
      update: { avatarKey: key },
    });
    await this.storage.delete('public', [previous?.avatarKey]);
  }

  async removeAvatar(userId: string): Promise<void> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { avatarKey: true },
    });
    if (!profile?.avatarKey) return;
    await this.prisma.profile.update({ where: { userId }, data: { avatarKey: null } });
    await this.storage.delete('public', [profile.avatarKey]);
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
    const [profile, documents] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId }, select: { avatarKey: true } }),
      this.prisma.userDocument.findMany({
        where: { userId, deletedAt: null },
        select: { frontKey: true, backKey: true },
      }),
    ]);
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
      await tx.profile.deleteMany({ where: { userId } });
      await tx.userDocument.updateMany({
        where: { userId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await this.audit.log(
        { actorType: 'USER', actorId: userId, action: 'user.account.delete', ip: client.ip },
        tx,
      );
    });
    // Personal files go too (DPDP right to erasure).
    await this.storage.delete('public', [profile?.avatarKey]);
    await this.storage.delete(
      'private',
      documents.flatMap((d) => [d.frontKey, d.backKey]),
    );
  }
}
