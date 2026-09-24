import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RateLimiter } from '../../redis/rate-limiter.js';
import { assertVerified } from '../auth/verified.guard.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { BlocksService } from '../safety/blocks.service.js';
import { ChatPresenter, type ConversationRow, conversationInclude } from './chat-presenter.js';
import type {
  ConversationDto,
  ConversationPageDto,
  ListConversationsQueryDto,
  UnreadDto,
} from './dto/chat.dto.js';

export const NEW_CONVERSATIONS_PER_DAY = 20;

/** The two people in a conversation. */
export interface Participants {
  id: string;
  listingId: string;
  borrowerId: string;
  lenderId: string;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: RateLimiter,
    private readonly blocks: BlocksService,
    private readonly presenter: ChatPresenter,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Opens (or returns) the borrower's chat about a listing. Only the borrower
   * starts it, on someone else's LIVE listing, with a verified phone and email.
   */
  async start(borrowerId: string, listingId: string): Promise<ConversationDto> {
    await assertVerified(this.prisma, borrowerId);
    const existing = await this.prisma.conversation.findUnique({
      where: { listingId_borrowerId: { listingId, borrowerId } },
      select: { id: true },
    });
    if (existing) return this.get(existing.id, borrowerId);

    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: 'LIVE', deletedAt: null, lender: { status: 'ACTIVE' } },
      select: { lenderId: true },
    });
    if (!listing) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Listing not found', HttpStatus.NOT_FOUND);
    }
    if (listing.lenderId === borrowerId) {
      throw new AppException(
        ErrorCode.CONVERSATION_NOT_ALLOWED,
        'This is your own listing',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.blocks.assertNotBlocked(borrowerId, listing.lenderId);
    await this.limiter.hit({
      key: `chat:start:${borrowerId}`,
      limit: NEW_CONVERSATIONS_PER_DAY,
      windowSec: 24 * 3600,
      message: 'You’ve started a lot of chats today. Please try again tomorrow.',
    });
    try {
      const created = await this.prisma.conversation.create({
        data: { listingId, borrowerId, lenderId: listing.lenderId },
        select: { id: true },
      });
      return this.get(created.id, borrowerId);
    } catch (err) {
      // Two taps at once: the other request created it.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const again = await this.prisma.conversation.findUniqueOrThrow({
          where: { listingId_borrowerId: { listingId, borrowerId } },
          select: { id: true },
        });
        return this.get(again.id, borrowerId);
      }
      throw err;
    }
  }

  /** The conversation if [userId] is in it; 404 otherwise (never reveal others' chats). */
  async participants(conversationId: string, userId: string): Promise<Participants> {
    const c = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, listingId: true, borrowerId: true, lenderId: true },
    });
    if (!c || (c.borrowerId !== userId && c.lenderId !== userId)) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Conversation not found', HttpStatus.NOT_FOUND);
    }
    return c;
  }

  async get(conversationId: string, viewerId: string): Promise<ConversationDto> {
    await this.participants(conversationId, viewerId);
    const row = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: conversationInclude(),
    });
    return (await this.present([row], viewerId))[0]!;
  }

  /**
   * The inbox, most recent first. A lender only sees a chat once the borrower
   * has written something.
   */
  async list(userId: string, query: ListConversationsQueryDto): Promise<ConversationPageDto> {
    const cursor = decodeCursor(query.cursor);
    const rows = await this.prisma.conversation.findMany({
      where: {
        AND: [
          {
            OR: [{ borrowerId: userId }, { lenderId: userId, lastMessagePreview: { not: null } }],
          },
          cursor
            ? {
                OR: [
                  { lastMessageAt: { lt: cursor.at } },
                  { lastMessageAt: cursor.at, id: { lt: cursor.id } },
                ],
              }
            : {},
        ],
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: conversationInclude(),
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: await this.present(page, userId),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor(last.lastMessageAt, last.id) : null,
    };
  }

  async unread(userId: string): Promise<UnreadDto> {
    const rows = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        readAt: null,
        senderId: { not: userId },
        conversation: { OR: [{ borrowerId: userId }, { lenderId: userId }] },
      },
      _count: { _all: true },
    });
    return {
      conversations: rows.length,
      messages: rows.reduce((sum, r) => sum + r._count._all, 0),
      notifications: await this.notifications.unreadCount(userId),
    };
  }

  /** Keeps the inbox order and preview current. */
  async touch(conversationId: string, preview: string, at: Date): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: at, lastMessagePreview: preview.slice(0, 200) },
    });
  }

  private async present(rows: ConversationRow[], viewerId: string): Promise<ConversationDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const others = rows.map((r) => (r.borrowerId === viewerId ? r.lenderId : r.borrowerId));
    const [unread, blocks] = await Promise.all([
      this.prisma.message.groupBy({
        by: ['conversationId'],
        where: { conversationId: { in: ids }, readAt: null, senderId: { not: viewerId } },
        _count: { _all: true },
      }),
      this.prisma.userBlock.findMany({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: { in: others } },
            { blockedId: viewerId, blockerId: { in: others } },
          ],
        },
      }),
    ]);
    const unreadBy = new Map(unread.map((u) => [u.conversationId, u._count._all]));
    return rows.map((r) => {
      const other = r.borrowerId === viewerId ? r.lenderId : r.borrowerId;
      return this.presenter.conversation(r, viewerId, {
        unreadCount: unreadBy.get(r.id) ?? 0,
        blockedByMe: blocks.some((b) => b.blockerId === viewerId && b.blockedId === other),
        blockedByThem: blocks.some((b) => b.blockerId === other && b.blockedId === viewerId),
      });
    });
  }
}

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify({ at: at.toISOString(), id })).toString('base64url');
}

function decodeCursor(cursor?: string): { at: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      at?: unknown;
      id?: unknown;
    };
    const at = new Date(String(v.at));
    if (typeof v.id !== 'string' || Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/i.test(v.id)) {
      throw new Error('bad cursor');
    }
    return { at, id: v.id };
  } catch {
    throw new AppException(
      ErrorCode.VALIDATION_FAILED,
      'Request validation failed',
      HttpStatus.BAD_REQUEST,
      {
        cursor: ['is invalid'],
      },
    );
  }
}
