import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RateLimiter } from '../../redis/rate-limiter.js';
import { AuditService } from '../audit/audit.service.js';
import { userViewInclude } from '../users/user-view.js';
import type {
  AdminReportDto,
  AdminReportPageDto,
  CreateReportDto,
  ListReportsQueryDto,
  ReportCreatedDto,
  ReportTargetDto,
} from './dto/safety.dto.js';
import { ParticipantPresenter } from './participants.js';

export const REPORTS_PER_DAY = 10;

const reportInclude = () =>
  ({ reporter: { include: userViewInclude() } }) satisfies Prisma.ReportInclude;
type ReportRow = Prisma.ReportGetPayload<{ include: ReturnType<typeof reportInclude> }>;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
    private readonly participants: ParticipantPresenter,
  ) {}

  async create(reporterId: string, dto: CreateReportDto): Promise<ReportCreatedDto> {
    let conversationId = dto.conversationId ?? null;
    switch (dto.targetType) {
      case 'USER': {
        if (dto.targetId === reporterId) throw invalid('You can’t report yourself');
        if (!(await this.prisma.user.count({ where: { id: dto.targetId } }))) throw notFound();
        break;
      }
      case 'LISTING': {
        const listing = await this.prisma.listing.findUnique({
          where: { id: dto.targetId },
          select: { lenderId: true, deletedAt: true },
        });
        if (!listing || listing.deletedAt) throw notFound();
        if (listing.lenderId === reporterId) throw invalid('You can’t report your own listing');
        break;
      }
      case 'MESSAGE': {
        // Only someone in the chat can report a message in it.
        const message = await this.prisma.message.findUnique({
          where: { id: dto.targetId },
          select: {
            senderId: true,
            conversation: { select: { id: true, borrowerId: true, lenderId: true } },
          },
        });
        const c = message?.conversation;
        if (!message || !c || (c.borrowerId !== reporterId && c.lenderId !== reporterId)) {
          throw notFound();
        }
        if (message.senderId === reporterId) throw invalid('You can’t report your own message');
        conversationId = c.id;
        break;
      }
    }
    if (conversationId) {
      const inChat = await this.prisma.conversation.count({
        where: {
          id: conversationId,
          OR: [{ borrowerId: reporterId }, { lenderId: reporterId }],
        },
      });
      if (!inChat) conversationId = null; // Context only; never trust someone else's chat id.
    }

    await this.limiter.hit({
      key: `reports:${reporterId}`,
      limit: REPORTS_PER_DAY,
      windowSec: 24 * 3600,
      message: 'You’ve sent a lot of reports today. Please try again tomorrow.',
    });
    try {
      const report = await this.prisma.report.create({
        data: {
          reporterId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          reason: dto.reason,
          note: dto.note?.trim() || null,
          conversationId,
        },
      });
      return { id: report.id, status: report.status };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(
          ErrorCode.REPORT_DUPLICATE,
          'You’ve already reported this. Our team is looking into it.',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  // ─── Admin ──────────────────────────────────────────────────────────────

  /** Open reports oldest first (a queue); closed ones newest first. */
  async list(query: ListReportsQueryDto): Promise<AdminReportPageDto> {
    const oldestFirst = query.status === 'OPEN';
    const rows = await this.prisma.report.findMany({
      where: {
        status: query.status,
        ...(query.cursor ? { id: oldestFirst ? { gt: query.cursor } : { lt: query.cursor } } : {}),
      },
      orderBy: { id: oldestFirst ? 'asc' : 'desc' },
      take: query.limit + 1,
      include: reportInclude(),
    });
    const page = rows.slice(0, query.limit);
    return {
      items: await Promise.all(page.map((r) => this.present(r))),
      nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
    };
  }

  async get(id: string): Promise<AdminReportDto> {
    const row = await this.prisma.report.findUnique({ where: { id }, include: reportInclude() });
    if (!row) throw notFound('Report not found');
    return this.present(row);
  }

  async resolve(
    adminId: string,
    id: string,
    outcome: 'ACTIONED' | 'DISMISSED',
    note: string,
    client: ClientInfo,
  ): Promise<AdminReportDto> {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw notFound('Report not found');
    if (report.status !== 'OPEN') {
      throw new AppException(
        ErrorCode.REPORT_STATUS_CONFLICT,
        'This report is already closed',
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id },
        data: {
          status: outcome,
          resolvedById: adminId,
          resolutionNote: note.trim(),
          resolvedAt: new Date(),
        },
      });
      await this.audit.log(
        {
          actorType: 'ADMIN',
          actorId: adminId,
          action: `admin.report.${outcome === 'ACTIONED' ? 'action' : 'dismiss'}`,
          targetType: 'report',
          targetId: id,
          metadata: { note: note.trim(), target: `${report.targetType}:${report.targetId}` },
          ip: client.ip,
        },
        tx,
      );
    });
    return this.get(id);
  }

  private async present(r: ReportRow): Promise<AdminReportDto> {
    const [target, openReportsOnTarget] = await Promise.all([
      this.target(r.targetType, r.targetId),
      this.prisma.report.count({
        where: { targetType: r.targetType, targetId: r.targetId, status: 'OPEN' },
      }),
    ]);
    return {
      id: r.id,
      status: r.status,
      reason: r.reason,
      note: r.note,
      reporter: this.participants.present(r.reporter),
      target,
      conversationId: r.conversationId,
      openReportsOnTarget,
      resolutionNote: r.resolutionNote,
      resolvedById: r.resolvedById,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
    };
  }

  private async target(type: string, id: string): Promise<ReportTargetDto> {
    const base = { type, id, status: null, originalText: null, ownerId: null };
    if (type === 'USER') {
      const u = await this.prisma.user.findUnique({
        where: { id },
        select: { name: true, status: true },
      });
      return { ...base, label: u?.name ?? 'Deleted user', status: u?.status ?? null, ownerId: id };
    }
    if (type === 'LISTING') {
      const l = await this.prisma.listing.findUnique({
        where: { id },
        select: { title: true, status: true, lenderId: true },
      });
      return {
        ...base,
        label: l?.title ?? 'Deleted listing',
        status: l?.status ?? null,
        ownerId: l?.lenderId ?? null,
      };
    }
    const m = await this.prisma.message.findUnique({
      where: { id },
      select: { type: true, body: true, maskedBody: true, senderId: true },
    });
    return {
      ...base,
      label: m?.maskedBody ?? (m ? `${m.type.toLowerCase()} message` : 'Deleted message'),
      originalText: m?.body ?? null,
      ownerId: m?.senderId ?? null,
    };
  }
}

function notFound(message = 'Not found'): AppException {
  return new AppException(ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND);
}

function invalid(message: string): AppException {
  return new AppException(ErrorCode.VALIDATION_FAILED, message, HttpStatus.BAD_REQUEST);
}
