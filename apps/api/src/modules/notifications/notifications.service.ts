import { Injectable, Logger } from '@nestjs/common';
import type { Notification } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PushProvider, type PushMessage } from '../../providers/push/push.provider.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import type {
  ListNotificationsQueryDto,
  NotificationDto,
  NotificationPageDto,
} from './dto/notification.dto.js';

/** Socket event carrying a new in-app notification. */
export const NOTIFICATION_NEW = 'notification:new';

export interface InAppNotice {
  /** Dotted, e.g. booking.requested */
  type: string;
  title: string;
  body: string;
  bookingId?: string;
}

/**
 * In-app notifications (the bell) and push. Tokens belong to a session, so signing out a device
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

  /**
   * Saves an in-app notification, sends it to the open app, and (with [push])
   * pushes it when the user is away. Never throws: telling someone must not
   * fail the action that caused it.
   */
  async notify(userId: string, notice: InAppNotice, opts: { push: boolean }): Promise<void> {
    try {
      const row = await this.prisma.notification.create({
        data: {
          userId,
          type: notice.type,
          title: notice.title,
          body: notice.body,
          data: notice.bookingId ? { bookingId: notice.bookingId } : undefined,
        },
      });
      this.realtime.toUser(userId, NOTIFICATION_NEW, toDto(row));
      if (opts.push) {
        await this.notifyIfAway(userId, {
          title: notice.title,
          body: notice.body,
          data: {
            type: notice.type,
            notificationId: row.id,
            ...(notice.bookingId ? { bookingId: notice.bookingId } : {}),
          },
        });
      }
    } catch (err) {
      this.logger.warn(
        `Notification to ${userId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async list(userId: string, query: ListNotificationsQueryDto): Promise<NotificationPageDto> {
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(query.cursor ? { id: { lt: query.cursor } } : {}) },
        orderBy: { id: 'desc' },
        take: query.limit + 1,
      }),
      this.unreadCount(userId),
    ]);
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(toDto),
      nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
      unread,
    };
  }

  /** Marks everything up to [upTo] (ids are time-ordered), or everything, as read. */
  async markRead(userId: string, upTo?: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(upTo ? { id: { lte: upTo } } : {}) },
      data: { readAt: new Date() },
    });
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }
}

function toDto(n: Notification): NotificationDto {
  const data = (n.data ?? {}) as { bookingId?: string };
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    bookingId: data.bookingId ?? null,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}
