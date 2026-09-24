import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { RateLimiter } from '../../redis/rate-limiter.js';
import { processChatImage } from '../media/image-pipeline.js';
import { invalid, UploadsService } from '../media/uploads.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { BlocksService } from '../safety/blocks.service.js';
import { ChatPresenter, type MessageRow } from './chat-presenter.js';
import { ConversationsService, type Participants } from './conversations.service.js';
import type {
  ListMessagesQueryDto,
  MessageDto,
  MessagePageDto,
  SendMessageDto,
} from './dto/chat.dto.js';
import { maskContacts } from './masking.js';

export const MESSAGES_PER_MINUTE = 30;

/** Socket events sent to apps. */
export const ChatEvent = {
  MESSAGE_NEW: 'message:new',
  MESSAGE_READ: 'message:read',
  OFFER_UPDATED: 'offer:updated',
  TYPING: 'typing',
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly presenter: ChatPresenter,
    private readonly blocks: BlocksService,
    private readonly limiter: RateLimiter,
    private readonly uploads: UploadsService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    conversationId: string,
    viewerId: string,
    query: ListMessagesQueryDto,
  ): Promise<MessagePageDto> {
    await this.conversations.participants(conversationId, viewerId);
    const revealed = await this.conversations.revealed(conversationId);
    const rows = await this.prisma.message.findMany({
      where: { conversationId, ...(query.before ? { id: { lt: query.before } } : {}) },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: { offer: true },
    });
    const page = rows.slice(0, query.limit);
    return {
      items: await Promise.all(page.map((m) => this.presenter.message(m, viewerId, revealed))),
      nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
    };
  }

  async send(conversationId: string, senderId: string, dto: SendMessageDto): Promise<MessageDto> {
    const c = await this.conversations.participants(conversationId, senderId);
    // A retried send (same clientId) returns what was stored the first time.
    const again = await this.prisma.message.findUnique({
      where: {
        conversationId_senderId_clientId: { conversationId, senderId, clientId: dto.clientId },
      },
      include: { offer: true },
    });
    if (again) return this.presenter.message(again, senderId);

    const body = dto.type === 'TEXT' ? dto.body!.trim() : '';
    if (dto.type === 'TEXT' && !body) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Request validation failed',
        HttpStatus.BAD_REQUEST,
        {
          body: ['must not be empty'],
        },
      );
    }
    await this.blocks.assertNotBlocked(senderId, otherParty(c, senderId));
    await this.limiter.hit({
      key: `chat:send:${senderId}`,
      limit: MESSAGES_PER_MINUTE,
      windowSec: 60,
      message: 'You’re sending messages too quickly. Wait a moment and try again.',
    });

    let message: MessageRow;
    if (dto.type === 'TEXT') {
      // Once the booking is paid, contact details are shared as typed.
      const { text, masked } = (await this.conversations.revealed(c.id))
        ? { text: body, masked: false }
        : maskContacts(body);
      message = await this.create(c, senderId, dto.clientId, {
        type: 'TEXT',
        body,
        maskedBody: text,
        masked,
      });
    } else {
      message = await this.createImage(c, senderId, dto.clientId, dto.key!);
    }
    await this.conversations.touch(c.id, previewOf(message), message.createdAt);
    await this.broadcast(c, message);
    return this.presenter.message(message, senderId);
  }

  /** Marks everything the other person sent, up to [upTo], as read. */
  async markRead(conversationId: string, readerId: string, upTo: string): Promise<void> {
    const c = await this.conversations.participants(conversationId, readerId);
    const readAt = new Date();
    const { count } = await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: readerId }, readAt: null, id: { lte: upTo } },
      data: { readAt },
    });
    if (count > 0) {
      this.realtime.toUsers([c.borrowerId, c.lenderId], ChatEvent.MESSAGE_READ, {
        conversationId,
        readerId,
        upTo,
        readAt,
      });
    }
  }

  /**
   * Stores a message from the offers flow (OFFER or SYSTEM) and fans it out
   * like any other message.
   */
  async post(
    c: Participants,
    senderId: string,
    data: Omit<Prisma.MessageUncheckedCreateInput, 'conversationId' | 'senderId'>,
    tx?: Prisma.TransactionClient,
  ): Promise<MessageRow> {
    return (tx ?? this.prisma).message.create({
      data: { ...data, conversationId: c.id, senderId },
      include: { offer: true },
    });
  }

  /**
   * Sends [message] to both people (each sees their own version) and pushes if
   * they're away, unless [opts.push] is false (e.g. booking updates, which send
   * their own notification).
   */
  async broadcast(
    c: Participants,
    message: MessageRow,
    opts: { push: boolean } = { push: true },
  ): Promise<void> {
    const recipientId = otherParty(c, message.senderId);
    const revealed = await this.conversations.revealed(c.id);
    const [forSender, forRecipient] = await Promise.all([
      this.presenter.message(message, message.senderId),
      this.presenter.message(message, recipientId, revealed),
    ]);
    this.realtime.toUser(message.senderId, ChatEvent.MESSAGE_NEW, forSender);
    this.realtime.toUser(recipientId, ChatEvent.MESSAGE_NEW, forRecipient);
    if (!opts.push) return;

    const sender = await this.prisma.user.findUnique({
      where: { id: message.senderId },
      select: { name: true },
    });
    void this.notifications.notifyIfAway(recipientId, {
      title: sender?.name?.split(' ')[0] ?? 'New message',
      body: previewOf(message),
      data: { type: 'chat.message', conversationId: c.id, messageId: message.id },
    });
  }

  private async create(
    c: Participants,
    senderId: string,
    clientId: string,
    data: Pick<
      Prisma.MessageUncheckedCreateInput,
      'type' | 'body' | 'maskedBody' | 'masked' | 'imageKey' | 'thumbKey'
    >,
  ): Promise<MessageRow> {
    try {
      return await this.post(c, senderId, { ...data, clientId });
    } catch (err) {
      // The same send raced itself: return the stored one.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.prisma.message.findUniqueOrThrow({
          where: {
            conversationId_senderId_clientId: { conversationId: c.id, senderId, clientId },
          },
          include: { offer: true },
        });
      }
      throw err;
    }
  }

  private async createImage(
    c: Participants,
    senderId: string,
    clientId: string,
    uploadKey: string,
  ): Promise<MessageRow> {
    const bytes = await this.uploads.claim(senderId, uploadKey, 'CHAT_IMAGE');
    try {
      let photo: Awaited<ReturnType<typeof processChatImage>>;
      try {
        photo = await processChatImage(bytes);
      } catch {
        throw invalid('That photo could not be read. Try another one.');
      }
      const base = `chat/${c.id}/${randomUUID()}`;
      const imageKey = `${base}.webp`;
      const thumbKey = `${base}-thumb.webp`;
      await Promise.all([
        this.storage.put('private', imageKey, photo.full, 'image/webp'),
        this.storage.put('private', thumbKey, photo.thumb, 'image/webp'),
      ]);
      return await this.create(c, senderId, clientId, { type: 'IMAGE', imageKey, thumbKey });
    } finally {
      await this.uploads.discard(uploadKey);
    }
  }
}

export function otherParty(c: Participants, userId: string): string {
  return c.borrowerId === userId ? c.lenderId : c.borrowerId;
}

/** Inbox and push preview; never contains unmasked contact details. */
export function previewOf(m: MessageRow): string {
  switch (m.type) {
    case 'TEXT':
      return m.maskedBody ?? '';
    case 'IMAGE':
      return '📷 Photo';
    case 'OFFER':
      return m.offer
        ? `Offer: ₹${(m.offer.pricePerDayPaise / 100).toLocaleString('en-IN')}/day for ${m.offer.days} ${m.offer.days === 1 ? 'day' : 'days'}`
        : 'Offer';
    case 'SYSTEM':
      return m.body ?? '';
  }
}
