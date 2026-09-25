import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REDIS } from '../../redis/redis.token.js';
import { analyticsRange } from './analytics-range.js';
import type { AnalyticsDto, AnalyticsMetricsDto } from './dto/analytics.dto.js';

type Metric = keyof AnalyticsMetricsDto;

/** Each metric: which timestamp dates it, what it adds up, and which rows count. */
const METRICS: Record<Metric, { table: string; at: string; value: string; where?: string }> = {
  signups: { table: 'users', at: 'created_at', value: 'count(*)' },
  listings: { table: 'listings', at: 'published_at', value: 'count(*)' },
  requested: {
    table: 'booking_events',
    at: 'created_at',
    value: 'count(*)',
    where: `type = 'REQUESTED'`,
  },
  confirmed: {
    table: 'booking_events',
    at: 'created_at',
    value: 'count(*)',
    where: `type = 'PAID'`,
  },
  completed: {
    table: 'booking_events',
    at: 'created_at',
    value: 'count(*)',
    where: `type IN ('COMPLETED', 'DISPUTE_RESOLVED')`,
  },
  cancelled: {
    table: 'booking_events',
    at: 'created_at',
    value: 'count(*)',
    where: `type IN ('CANCELLED', 'NO_SHOW')`,
  },
  gmvPaise: { table: 'payments', at: 'captured_at', value: 'sum(amount_paise)' },
  revenuePaise: {
    table: 'ledger_entries',
    at: 'created_at',
    value: 'sum(credit_paise - debit_paise)',
    where: `account = 'PLATFORM_REVENUE'`,
  },
  refundsPaise: {
    table: 'refunds',
    at: 'created_at',
    value: 'sum(amount_paise)',
    where: `status <> 'FAILED'`,
  },
  disputesOpened: { table: 'disputes', at: 'created_at', value: 'count(*)' },
  disputesSettled: { table: 'disputes', at: 'resolved_at', value: 'count(*)' },
  referralSignups: { table: 'referrals', at: 'created_at', value: 'count(*)' },
  creditsSpentPaise: {
    table: 'ledger_entries',
    at: 'created_at',
    value: 'sum(debit_paise - credit_paise)',
    where: `account = 'PROMOTIONS'`,
  },
};

const METRIC_NAMES = Object.keys(METRICS) as Metric[];
const CACHE_SEC = 300;

const zero = (): AnalyticsMetricsDto =>
  Object.fromEntries(METRIC_NAMES.map((m) => [m, 0])) as unknown as AnalyticsMetricsDto;

/** Midnight IST at the start of [date], as a timestamp. */
const istMidnight = (date: string) => new Date(`${date}T00:00:00+05:30`);

/**
 * Numbers for the admin dashboard, bucketed by day in India. Timestamps are
 * stored as UTC without a zone, hence `AT TIME ZONE 'UTC' AT TIME ZONE
 * 'Asia/Kolkata'`. Cached for 5 minutes: the dashboard doesn't need to be live.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async get(days: number, now = new Date()): Promise<AnalyticsDto> {
    const range = analyticsRange(days, now);
    const key = `analytics:${days}:${range.to}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as AnalyticsDto;

    const start = istMidnight(range.previousFrom);
    const end = new Date(istMidnight(range.to).getTime() + 86_400_000);
    const byDay = new Map<string, AnalyticsMetricsDto>();
    const day = (d: string) => byDay.get(d) ?? byDay.set(d, zero()).get(d)!;

    await Promise.all(
      METRIC_NAMES.map(async (name) => {
        const m = METRICS[name];
        const rows = await this.prisma.$queryRaw<{ day: Date; v: bigint | number | null }[]>`
          SELECT ((${Prisma.raw(m.at)} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date AS day,
                 ${Prisma.raw(m.value)} AS v
          FROM ${Prisma.raw(m.table)}
          WHERE ${Prisma.raw(m.at)} >= ${start} AND ${Prisma.raw(m.at)} < ${end}
            ${m.where ? Prisma.raw(`AND ${m.where}`) : Prisma.empty}
          GROUP BY 1`;
        for (const r of rows) day(r.day.toISOString().slice(0, 10))[name] = Number(r.v ?? 0);
      }),
    );

    const sum = (dates: string[]) => {
      const total = zero();
      for (const d of dates) {
        const m = byDay.get(d);
        if (m) for (const n of METRIC_NAMES) total[n] += m[n];
      }
      return total;
    };
    const previousDates = analyticsRange(days, istMidnight(range.previousTo)).dates;

    const [users, liveListings, activeRentals, openDisputes, funnel] = await Promise.all([
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.listing.count({ where: { status: 'LIVE', deletedAt: null } }),
      this.prisma.booking.count({ where: { status: 'ACTIVE' } }),
      this.prisma.dispute.count({ where: { status: 'OPEN' } }),
      this.prisma.$queryRaw<{ requested: bigint; confirmed: bigint; completed: bigint }[]>`
        SELECT count(*) AS requested,
               count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM booking_events e WHERE e.booking_id = b.id AND e.type = 'PAID'
               )) AS confirmed,
               count(*) FILTER (WHERE b.status = 'COMPLETED') AS completed
        FROM bookings b
        WHERE b.created_at >= ${istMidnight(range.from)} AND b.created_at < ${end}`,
    ]);

    const result: AnalyticsDto = {
      days,
      from: range.from,
      to: range.to,
      totals: sum(range.dates),
      previous: sum(previousDates),
      series: range.dates.map((date) => ({ date, ...(byDay.get(date) ?? zero()) })),
      now: { users, liveListings, activeRentals, openDisputes },
      funnel: {
        requested: Number(funnel[0]!.requested),
        confirmed: Number(funnel[0]!.confirmed),
        completed: Number(funnel[0]!.completed),
      },
      generatedAt: now,
    };
    await this.redis.set(key, JSON.stringify(result), 'EX', CACHE_SEC);
    return result;
  }
}
