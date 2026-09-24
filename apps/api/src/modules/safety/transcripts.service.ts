import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { userViewInclude } from '../users/user-view.js';
import type { AdminTranscriptDto, TranscriptQueryDto } from './dto/safety.dto.js';
import { ParticipantPresenter } from './participants.js';

const IMAGE_URL_TTL_SEC = 10 * 60;

/**
 * Read-only chat transcripts for moderation, with what senders actually typed.
 * Private conversations: every view is written to the audit log.
 */
@Injectable()
export class TranscriptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly participants: ParticipantPresenter,
  ) {}

  async get(
    adminId: string,
    conversationId: string,
    query: TranscriptQueryDto,
    client: ClientInfo,
  ): Promise<AdminTranscriptDto> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        listing: { select: { id: true, title: true } },
        borrower: { include: userViewInclude() },
        lender: { include: userViewInclude() },
      },
    });
    if (!conversation) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Conversation not found', HttpStatus.NOT_FOUND);
    }
    const rows = await this.prisma.message.findMany({
      where: { conversationId, ...(query.before ? { id: { lt: query.before } } : {}) },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: { offer: true },
    });
    const page = rows.slice(0, query.limit);
    await this.audit.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.conversation.view',
      targetType: 'conversation',
      targetId: conversationId,
      metadata: { before: query.before ?? null, messages: page.length },
      ip: client.ip,
    });
    return {
      conversationId,
      listingId: conversation.listing.id,
      listingTitle: conversation.listing.title,
      borrower: this.participants.present(conversation.borrower),
      lender: this.participants.present(conversation.lender),
      messages: await Promise.all(
        page.map(async (m) => ({
          id: m.id,
          senderId: m.senderId,
          type: m.type,
          body: m.body,
          masked: m.masked,
          imageUrl: m.imageKey
            ? await this.storage.presignGet(m.imageKey, IMAGE_URL_TTL_SEC)
            : null,
          offerSummary: m.offer
            ? `${day(m.offer.startsOn)} – ${day(m.offer.endsOn)} · ${rupees(m.offer.pricePerDayPaise)}/day · ${m.offer.status}`
            : null,
          createdAt: m.createdAt,
        })),
      ),
      nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
    };
  }
}

function day(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
