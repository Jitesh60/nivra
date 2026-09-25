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
import type { UpdateNotificationPreferencesDto } from './dto/preferences.dto.js';
import { allowsPush, DEFAULT_PREFERENCES, type Preferences } from './preferences.js';

/** Socket event carrying a new in-app notification. */
export const NOTIFICATION_NEW = 'notification:new';

export interface InAppNotice {
  /** Dotted, e.g. booking.requested */
  type: string;
  title: string;
  body: string;
  bookingId?: string;
  /** What to open when tapped (Phase 10): a listing (saved-search alert) or a request. */
  listingId?: string;
  requestId?: string;
}

function links(notice: InAppNotice): Record<string, string> {
  const out: Record<string, string> = {};
  if (notice.bookingId) out.bookingId = notice.bookingId;
  if (notice.listingId) out.listingId = notice.listingId;
  if (notice.requestId) out.requestId = notice.requestId;
  return out;
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

  /** The user's choices, or the defaults when they never changed any. */
  async preferences(userId: string): Promise<Preferences> {
    const row = await this.prisma.notificationPreferences.findUnique({ where: { userId } });
    if (!row) return { ...DEFAULT_PREFERENCES };
    const { userId: _, updatedAt: __, ...prefs } = row;
    return prefs;
  }

  async updatePreferences(
    userId: string,
    change: UpdateNotificationPreferencesDto,
  ): Promise<Preferences> {
    const data = Object.fromEntries(
      Object.entries(change).filter(([, v]) => typeof v === 'boolean'),
    ) as Partial<Preferences>;
    await this.prisma.notificationPreferences.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_PREFERENCES, ...data },
      update: data,
    });
    return this.preferences(userId);
  }

  /**
   * Pushes to the user's signed-in devices, unless they have the app open
   * (then the socket already delivered it) or they turned this kind of push
   * off (the type is in `message.data.type`). Never throws: a failed push
   * must not fail the action that caused it.
   */
  async notifyIfAway(userId: string, message: PushMessage): Promise<void> {
    try {
      const type = message.data?.type;
      if (type && !allowsPush(await this.preferences(userId), type)) return;
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
          data: Object.keys(links(notice)).length ? links(notice) : undefined,
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
            ...links(notice),
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
  const data = (n.data ?? {}) as { bookingId?: string; listingId?: string; requestId?: string };
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    bookingId: data.bookingId ?? null,
    listingId: data.listingId ?? null,
    requestId: data.requestId ?? null,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}
