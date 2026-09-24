import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { userViewInclude } from '../users/user-view.js';
import type { BlockedUserDto } from './dto/safety.dto.js';
import { ParticipantPresenter } from './participants.js';

/** Who has blocked whom. A block in either direction stops messages and offers. */
@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participants: ParticipantPresenter,
  ) {}

  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'You can’t block yourself',
        HttpStatus.BAD_REQUEST,
      );
    }
    const exists = await this.prisma.user.count({ where: { id: blockedId } });
    if (!exists)
      throw new AppException(ErrorCode.NOT_FOUND, 'User not found', HttpStatus.NOT_FOUND);
    await this.prisma.userBlock.createMany({
      data: [{ blockerId, blockedId }],
      skipDuplicates: true,
    });
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
  }

  async list(blockerId: string): Promise<BlockedUserDto[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
      include: { blocked: { include: userViewInclude() } },
    });
    return rows.map((r) => ({
      user: this.participants.present(r.blocked),
      blockedAt: r.createdAt,
    }));
  }

  /** Blocks between two users: who blocked whom. */
  async between(a: string, b: string): Promise<{ aBlockedB: boolean; bBlockedA: boolean }> {
    const rows = await this.prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { blockerId: true },
    });
    return {
      aBlockedB: rows.some((r) => r.blockerId === a),
      bBlockedA: rows.some((r) => r.blockerId === b),
    };
  }

  /** Throws USER_BLOCKED if either has blocked the other. */
  async assertNotBlocked(a: string, b: string): Promise<void> {
    const { aBlockedB, bBlockedA } = await this.between(a, b);
    if (aBlockedB || bBlockedA) {
      throw new AppException(
        ErrorCode.USER_BLOCKED,
        aBlockedB
          ? 'You blocked this person. Unblock them to continue.'
          : 'You can’t message this person.',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
