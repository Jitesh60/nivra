import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RateLimiter } from '../../redis/rate-limiter.js';
import { AuditService } from '../audit/audit.service.js';
import { assertVerified } from '../auth/verified.guard.js';
import { isoDate } from '../bookings/booking-presenter.js';
import { CategoriesService } from '../categories/categories.service.js';
import { CategoryDto } from '../categories/dto/category.dto.js';
import { ConversationsService } from '../chat/conversations.service.js';
import { maskContacts } from '../chat/masking.js';
import { MessagesService } from '../chat/messages.service.js';
import { DiscoveryQueue } from '../discovery/discovery-queue.js';
import { addDays, todayUtc } from '../listings/listing-rules.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ParticipantPresenter } from '../safety/participants.js';
import { decodeCursor, encodeCursor, point, roundDistanceKm } from '../search/search-sql.js';
import { SearchService } from '../search/search.service.js';
import { userViewInclude } from '../users/user-view.js';
import type {
  AdminItemRequestDto,
  AdminItemRequestPageDto,
  AdminListRequestsQueryDto,
  CreateRequestDto,
  ItemRequestDetailDto,
  ItemRequestDto,
  ItemRequestPageDto,
  ListRequestsQueryDto,
  RequestResponseDto,
  RespondToRequestDto,
} from './dto/request.dto.js';
import { REQUEST_RULES as R, requestExpiresAt } from './request-rules.js';

const requestInclude = () =>
  ({
    borrower: { include: userViewInclude() },
    category: true,
    _count: { select: { responses: true } },
  }) satisfies Prisma.ItemRequestInclude;
type RequestRow = Prisma.ItemRequestGetPayload<{ include: ReturnType<typeof requestInclude> }>;

const responseInclude = () =>
  ({ lender: { include: userViewInclude() } }) satisfies Prisma.RequestResponseInclude;
type ResponseRow = Prisma.RequestResponseGetPayload<{
  include: ReturnType<typeof responseInclude>;
}>;

/** An open request that hasn't passed its expiry (the hourly job catches up on the status). */
const isOpen = (r: { status: string; expiresAt: Date }, now = new Date()) =>
  r.status === 'OPEN' && r.expiresAt > now;

/**
 * "Request an item" (Phase 10): borrowers post what they need, lenders nearby
 * answer with one of their listings, which opens the chat about it.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: RateLimiter,
    private readonly categories: CategoriesService,
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly notifications: NotificationsService,
    private readonly participants: ParticipantPresenter,
    private readonly search: SearchService,
    private readonly discovery: DiscoveryQueue,
    private readonly audit: AuditService,
  ) {}

  // ── Borrowers ──

  async create(userId: string, dto: CreateRequestDto): Promise<ItemRequestDetailDto> {
    await assertVerified(this.prisma, userId);
    if (dto.categoryId) await this.categories.assertActive(dto.categoryId);
    const { start, end } = checkDates(dto);
    const open = await this.prisma.itemRequest.count({
      where: { borrowerId: userId, status: 'OPEN', expiresAt: { gt: new Date() } },
    });
    if (open >= R.maxOpen) {
      throw new AppException(
        ErrorCode.REQUEST_LIMIT,
        `You can have ${R.maxOpen} open requests. Close one to post another.`,
        HttpStatus.CONFLICT,
      );
    }
    await this.limiter.hit({
      key: `request:create:${userId}`,
      limit: R.perDay,
      windowSec: 24 * 3600,
      message: 'You’ve posted a lot of requests today. Please try again tomorrow.',
    });
    const now = new Date();
    const row = await this.prisma.itemRequest.create({
      data: {
        borrowerId: userId,
        title: dto.title,
        details: dto.details,
        categoryId: dto.categoryId ?? null,
        startDate: start,
        endDate: end,
        budgetPerDayPaise: dto.budgetPerDayPaise ?? null,
        lat: dto.lat,
        lng: dto.lng,
        areaLabel: dto.areaLabel,
        expiresAt: requestExpiresAt(now, end),
      },
      include: requestInclude(),
    });
    await this.discovery.requestPosted(row.id);
    return { ...this.present(row, userId, null, false), responses: [] };
  }

  /** Open requests near a point, nearest first; never your own or a blocked person's. */
  async list(userId: string, query: ListRequestsQueryDto): Promise<ItemRequestPageDto> {
    const origin = point(query.lat, query.lng);
    const where: Prisma.Sql[] = [
      Prisma.sql`r.status = 'OPEN'`,
      Prisma.sql`r.expires_at > now()`,
      Prisma.sql`u.status = 'ACTIVE'`,
      Prisma.sql`r.borrower_id <> ${userId}::uuid`,
      Prisma.sql`ST_DWithin(r.location, ${origin}, ${query.radiusKm * 1000}::float8)`,
      Prisma.sql`NOT EXISTS (
        SELECT 1 FROM user_blocks b
        WHERE (b.blocker_id = r.borrower_id AND b.blocked_id = ${userId}::uuid)
           OR (b.blocker_id = ${userId}::uuid AND b.blocked_id = r.borrower_id))`,
    ];
    if (query.categoryId) where.push(Prisma.sql`r.category_id = ${query.categoryId}::uuid`);
    if (query.cursor) {
      const c = decodeCursor(query.cursor);
      where.push(
        Prisma.sql`(ST_Distance(r.location, ${origin}), r.id) > (${c.v}::float8, ${c.id}::uuid)`,
      );
    }
    const rows = await this.prisma.$queryRaw<{ id: string; distance_m: number }[]>`
      SELECT r.id::text AS id, ST_Distance(r.location, ${origin}) AS distance_m
      FROM item_requests r JOIN users u ON u.id = r.borrower_id
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY distance_m ASC, r.id ASC
      LIMIT ${query.limit + 1}`;
    const page = rows.slice(0, query.limit);
    const byId = await this.load(page.map((r) => r.id));
    const answered = await this.answeredBy(
      userId,
      page.map((r) => r.id),
    );
    const last = page.at(-1);
    return {
      items: page.flatMap((r) => {
        const row = byId.get(r.id);
        return row ? [this.present(row, userId, Number(r.distance_m), answered.has(r.id))] : [];
      }),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ v: Number(last.distance_m), id: last.id })
          : null,
    };
  }

  /**
   * One request. Open ones are visible to everyone nearby; your own in any
   * state, with every answer. A lender sees only their own answers.
   */
  async get(userId: string, id: string): Promise<ItemRequestDetailDto> {
    const row = await this.prisma.itemRequest.findUnique({
      where: { id },
      include: requestInclude(),
    });
    const mine = row?.borrowerId === userId;
    if (!row || (!mine && (!isOpen(row) || row.borrower.status !== 'ACTIVE'))) throw notFound();
    if (!mine && (await this.blocked(userId, row.borrowerId))) throw notFound();
    const responses = await this.prisma.requestResponse.findMany({
      where: { requestId: id, ...(mine ? {} : { lenderId: userId }) },
      include: responseInclude(),
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...this.present(row, userId, null, !mine && responses.length > 0),
      responses: await this.presentResponses(responses, userId),
    };
  }

  /** Your requests, newest first, with their answers. */
  async mine(userId: string): Promise<ItemRequestDetailDto[]> {
    const rows = await this.prisma.itemRequest.findMany({
      where: { borrowerId: userId, status: { not: 'REMOVED' } },
      include: requestInclude(),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const responses = await this.prisma.requestResponse.findMany({
      where: { requestId: { in: rows.map((r) => r.id) } },
      include: responseInclude(),
      orderBy: { createdAt: 'asc' },
    });
    const presented = await this.presentResponses(responses, userId);
    return rows.map((r) => ({
      ...this.present(r, userId, null, false),
      responses: presented.filter((_, i) => responses[i]!.requestId === r.id),
    }));
  }

  async close(userId: string, id: string): Promise<ItemRequestDetailDto> {
    const row = await this.prisma.itemRequest.findUnique({ where: { id } });
    if (!row || row.borrowerId !== userId) throw notFound();
    if (row.status === 'OPEN') {
      await this.prisma.itemRequest.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
    }
    return this.get(userId, id);
  }

  // ── Lenders ──

  /**
   * Offers one of the lender's LIVE listings for the request: opens (or reuses)
   * the chat about that listing, posts the message there and tells the borrower.
   */
  async respond(
    lenderId: string,
    id: string,
    dto: RespondToRequestDto,
  ): Promise<ItemRequestDetailDto> {
    await assertVerified(this.prisma, lenderId);
    const request = await this.prisma.itemRequest.findUnique({
      where: { id },
      include: { borrower: { select: { status: true } } },
    });
    if (!request || request.borrower.status !== 'ACTIVE') throw notFound();
    if (request.borrowerId === lenderId) {
      throw new AppException(
        ErrorCode.REQUEST_OWN,
        'This is your own request',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!isOpen(request)) {
      throw new AppException(
        ErrorCode.REQUEST_NOT_OPEN,
        'This request is no longer open',
        HttpStatus.CONFLICT,
      );
    }
    const listing = await this.prisma.listing.findFirst({
      where: { id: dto.listingId, lenderId, status: 'LIVE', deletedAt: null },
      select: { id: true, title: true },
    });
    if (!listing) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Choose one of your live listings',
        HttpStatus.NOT_FOUND,
      );
    }
    const already = await this.prisma.requestResponse.count({
      where: { requestId: id, listingId: listing.id },
    });
    if (already) {
      throw new AppException(
        ErrorCode.REQUEST_ALREADY_ANSWERED,
        'You already offered this listing for this request',
        HttpStatus.CONFLICT,
      );
    }
    await this.limiter.hit({
      key: `request:respond:${lenderId}`,
      limit: R.responsesPerDay,
      windowSec: 24 * 3600,
      message: 'You’ve answered a lot of requests today. Please try again tomorrow.',
    });

    const conversationId = await this.conversations.openForLender(
      lenderId,
      request.borrowerId,
      listing.id,
    );
    await this.messages.sendText(
      conversationId,
      lenderId,
      dto.message,
      `request-${id}-${listing.id}`,
    );
    try {
      await this.prisma.requestResponse.create({
        data: {
          requestId: id,
          lenderId,
          listingId: listing.id,
          conversationId,
          message: maskContacts(dto.message).text,
        },
      });
    } catch (err) {
      // A double tap: the first one already recorded it.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
    const lender = await this.prisma.user.findUnique({
      where: { id: lenderId },
      select: { name: true },
    });
    await this.notifications.notify(
      request.borrowerId,
      {
        type: 'request.response',
        title: `${lender?.name?.split(' ')[0] ?? 'A lender'} can help: ${listing.title}`,
        body: `For your request “${request.title}”. Open the chat to reply.`,
        requestId: id,
      },
      { push: true },
    );
    return this.get(lenderId, id);
  }

  // ── Jobs (discovery worker) ──

  /**
   * Tells lenders nearby who have something similar (same category, or the
   * title's words when there's no category). Returns how many were told.
   */
  async notifyNearby(requestId: string): Promise<number> {
    const r = await this.prisma.itemRequest.findUnique({ where: { id: requestId } });
    if (!r || !isOpen(r)) return 0;
    const similar = r.categoryId
      ? Prisma.sql`l.category_id = ${r.categoryId}::uuid`
      : Prisma.sql`l.search_vector @@ plainto_tsquery('english', ${r.title})`;
    const lenders = await this.prisma.$queryRaw<{ lender_id: string }[]>`
      SELECT l.lender_id::text, min(ST_Distance(l.location, q.location)) AS d
      FROM listings l
      JOIN users u ON u.id = l.lender_id AND u.status = 'ACTIVE'
      JOIN item_requests q ON q.id = ${r.id}::uuid
      WHERE l.status = 'LIVE' AND l.deleted_at IS NULL
        AND l.lender_id <> q.borrower_id
        AND ST_DWithin(l.location, q.location, ${R.nearbyKm * 1000}::float8)
        AND ${similar}
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = l.lender_id AND b.blocked_id = q.borrower_id)
             OR (b.blocker_id = q.borrower_id AND b.blocked_id = l.lender_id))
      GROUP BY l.lender_id
      ORDER BY d
      LIMIT ${R.notifyLenders}`;
    let told = 0;
    for (const { lender_id } of lenders) {
      const ok = await this.limiter.tryHit({
        key: `request:notice:${lender_id}`,
        limit: R.noticesPerLenderPerDay,
        windowSec: 24 * 3600,
      });
      if (!ok) continue;
      await this.notifications.notify(
        lender_id,
        {
          type: 'request.nearby',
          title: `Someone nearby needs: ${r.title}`,
          body: `${r.areaLabel}. Have one to lend? Offer it from the request.`,
          requestId: r.id,
        },
        { push: true },
      );
      told += 1;
    }
    return told;
  }

  /** Closes open requests past their expiry. Returns how many. */
  async expireDue(now = new Date()): Promise<number> {
    const { count } = await this.prisma.itemRequest.updateMany({
      where: { status: 'OPEN', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    return count;
  }

  // ── Admin ──

  async adminList(query: AdminListRequestsQueryDto): Promise<AdminItemRequestPageDto> {
    const rows = await this.prisma.itemRequest.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      include: requestInclude(),
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const reports = await this.openReports(page.map((r) => r.id));
    return {
      items: page.map((r) => ({
        ...this.present(r, '', null, false),
        responses: [],
        removedReason: r.removedReason,
        openReports: reports.get(r.id) ?? 0,
      })),
      nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
    };
  }

  async adminGet(id: string): Promise<AdminItemRequestDto> {
    const row = await this.prisma.itemRequest.findUnique({
      where: { id },
      include: requestInclude(),
    });
    if (!row) throw notFound();
    const responses = await this.prisma.requestResponse.findMany({
      where: { requestId: id },
      include: responseInclude(),
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...this.present(row, '', null, false),
      responses: await this.presentResponses(responses, undefined),
      removedReason: row.removedReason,
      openReports: (await this.openReports([id])).get(id) ?? 0,
    };
  }

  async adminRemove(
    adminId: string,
    id: string,
    reason: string,
    client: ClientInfo,
  ): Promise<AdminItemRequestDto> {
    const row = await this.prisma.itemRequest.findUnique({ where: { id } });
    if (!row) throw notFound();
    if (row.status !== 'REMOVED') {
      await this.prisma.itemRequest.update({
        where: { id },
        data: { status: 'REMOVED', removedReason: reason },
      });
      await this.audit.log({
        actorType: 'ADMIN',
        actorId: adminId,
        action: 'admin.request.remove',
        targetType: 'item_request',
        targetId: id,
        metadata: { reason },
        ip: client.ip,
      });
      await this.notifications.notify(
        row.borrowerId,
        {
          type: 'request.removed',
          title: 'Your request was removed',
          body: `“${row.title}”: ${reason}`,
          requestId: id,
        },
        { push: false },
      );
    }
    return this.adminGet(id);
  }

  // ── Helpers ──

  private async load(ids: string[]): Promise<Map<string, RequestRow>> {
    const rows = await this.prisma.itemRequest.findMany({
      where: { id: { in: ids } },
      include: requestInclude(),
    });
    return new Map(rows.map((r) => [r.id, r]));
  }

  private async answeredBy(lenderId: string, requestIds: string[]): Promise<Set<string>> {
    const rows = await this.prisma.requestResponse.findMany({
      where: { lenderId, requestId: { in: requestIds } },
      select: { requestId: true },
    });
    return new Set(rows.map((r) => r.requestId));
  }

  private async blocked(a: string, b: string): Promise<boolean> {
    return (
      (await this.prisma.userBlock.count({
        where: {
          OR: [
            { blockerId: a, blockedId: b },
            { blockerId: b, blockedId: a },
          ],
        },
      })) > 0
    );
  }

  private async openReports(ids: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.report.groupBy({
      by: ['targetId'],
      where: { targetType: 'REQUEST', status: 'OPEN', targetId: { in: ids } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.targetId, r._count._all]));
  }

  private present(
    r: RequestRow,
    viewerId: string,
    distanceM: number | null,
    answeredByMe: boolean,
  ): ItemRequestDto {
    const mine = r.borrowerId === viewerId;
    return {
      id: r.id,
      title: r.title,
      details: r.details,
      category: r.category ? CategoryDto.from(r.category) : null,
      startDate: r.startDate ? isoDate(r.startDate) : null,
      endDate: r.endDate ? isoDate(r.endDate) : null,
      budgetPerDayPaise: r.budgetPerDayPaise,
      areaLabel: r.areaLabel,
      distanceKm: distanceM === null || mine ? null : roundDistanceKm(distanceM),
      borrower: this.participants.present(r.borrower),
      status: isOpen(r) || r.status !== 'OPEN' ? r.status : 'EXPIRED',
      responseCount: r._count.responses,
      answeredByMe,
      mine,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    };
  }

  /** In the same order as [rows]. */
  private async presentResponses(
    rows: ResponseRow[],
    viewerId: string | undefined,
  ): Promise<RequestResponseDto[]> {
    const cards = await this.search.cardsFor(
      [...new Set(rows.map((r) => r.listingId))].slice(0, 20),
      viewerId,
    );
    const byId = new Map(cards.map((c) => [c.id, c]));
    return rows.map((r) => ({
      id: r.id,
      lender: this.participants.present(r.lender),
      listing: byId.get(r.listingId) ?? null,
      conversationId: r.conversationId,
      message: r.message,
      createdAt: r.createdAt,
    }));
  }
}

function notFound(): AppException {
  return new AppException(ErrorCode.NOT_FOUND, 'Request not found', HttpStatus.NOT_FOUND);
}

/** Optional dates: both or neither, from today, end ≥ start, within a year. */
function checkDates(dto: CreateRequestDto): { start: Date | null; end: Date | null } {
  if (!dto.startDate && !dto.endDate) return { start: null, end: null };
  const invalid = (field: string, message: string) =>
    new AppException(
      ErrorCode.VALIDATION_FAILED,
      'Request validation failed',
      HttpStatus.BAD_REQUEST,
      {
        [field]: [message],
      },
    );
  if (!dto.startDate || !dto.endDate)
    throw invalid('endDate', 'send startDate and endDate together');
  const start = new Date(`${dto.startDate}T00:00:00Z`);
  const end = new Date(`${dto.endDate}T00:00:00Z`);
  const today = todayUtc();
  if (start < today) throw invalid('startDate', 'must be today or later');
  if (end < start) throw invalid('endDate', 'must be on or after startDate');
  if (end > addDays(today, R.maxAheadDays)) throw invalid('endDate', 'must be within a year');
  return { start, end };
}
