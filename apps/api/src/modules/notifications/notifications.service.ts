import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PushProvider, type PushMessage } from '../../providers/push/push.provider.js';
import { RealtimeService } from '../realtime/realtime.service.js';

/**
 * Push notifications. Tokens belong to a session, so signing out a device
 * (or revoking its session) stops its pushes; stale tokens are cleaned up
 * when a push is sent.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushProvider,
    private readonly realtime: RealtimeService,
  ) {}

  async registerToken(
    userId: string,
    sessionId: string,
    token: string,
    platform: string,
  ): Promise<void> {
    // A token moves with the device: re-registering after another sign-in takes it over.
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, sessionId, token, platform },
      update: { userId, sessionId, platform, lastSeenAt: new Date() },
    });
  }

  async removeSessionTokens(sessionId: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { sessionId } });
  }

  /**
   * Pushes to the user's signed-in devices, unless they have the app open
   * (then the socket already delivered it). Never throws: a failed push must
   * not fail the action that caused it.
   */
  async notifyIfAway(userId: string, message: PushMessage): Promise<void> {
    try {
      if (await this.realtime.isOnline(userId)) return;
      const now = new Date();
      const tokens = await this.prisma.deviceToken.findMany({
        where: { userId },
        select: { token: true, session: { select: { revokedAt: true, expiresAt: true } } },
      });
      const live = tokens.filter((t) => !t.session.revokedAt && t.session.expiresAt > now);
      const stale = tokens.filter((t) => !live.includes(t)).map((t) => t.token);
      const { invalidTokens } = await this.push.send(
        live.map((t) => t.token),
        message,
      );
      const remove = [...stale, ...invalidTokens];
      if (remove.length > 0) {
        await this.prisma.deviceToken.deleteMany({ where: { token: { in: remove } } });
      }
    } catch (err) {
      this.logger.warn(
        `Push to ${userId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
