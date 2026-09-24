import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { Prisma, type WaitlistEntry } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REDIS } from '../../redis/redis.module.js';

export const WAITLIST_LIMIT = { perIpPerHour: 10 } as const;

export interface JoinInput {
  email: string;
  city?: string;
  role?: 'BORROWER' | 'LENDER' | 'BOTH';
  source?: string;
  website?: string;
}

@Injectable()
export class WaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Adds an email to the waitlist. Joining twice is not an error (the site
   * shows "you're already on the list"). Honeypot submissions are accepted
   * silently and never stored, so bots get no signal.
   */
  async join(input: JoinInput, ip?: string): Promise<{ ok: true; alreadyJoined: boolean }> {
    if (input.website) return { ok: true, alreadyJoined: false };
    if (ip) await this.limitIp(ip);

    try {
      await this.prisma.waitlistEntry.create({
        data: {
          email: input.email,
          city: input.city || null,
          role: input.role ?? null,
          source: input.source || null,
          ip: ip ?? null,
        },
      });
      return { ok: true, alreadyJoined: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { ok: true, alreadyJoined: true };
      }
      throw err;
    }
  }

  async list(query: { cursor?: string; limit: number }) {
    const [total, rows] = await Promise.all([
      this.prisma.waitlistEntry.count(),
      this.prisma.waitlistEntry.findMany({
        where: query.cursor ? { id: { lt: query.cursor } } : {},
        orderBy: { id: 'desc' },
        take: query.limit + 1,
      }),
    ]);
    const items = rows.slice(0, query.limit);
    return { total, items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  /** Whole list as CSV (RFC 4180), oldest first. Cells are protected against spreadsheet formula injection. */
  async csv(): Promise<string> {
    const rows = await this.prisma.waitlistEntry.findMany({ orderBy: { id: 'asc' } });
    const header = ['email', 'city', 'role', 'source', 'joined_at'];
    const lines = rows.map((r: WaitlistEntry) =>
      [r.email, r.city, r.role, r.source, r.createdAt.toISOString()].map(csvCell).join(','),
    );
    return `${[header.join(','), ...lines].join('\r\n')}\r\n`;
  }

  private async limitIp(ip: string): Promise<void> {
    const key = `waitlist:ip:${ip}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > WAITLIST_LIMIT.perIpPerHour) {
      throw new AppException(
        ErrorCode.RATE_LIMITED,
        'Too many sign-ups from this network. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfterSec: Math.max(await this.redis.ttl(key), 1) },
      );
    }
  }
}

export function csvCell(value: string | null | undefined): string {
  if (value == null) return '';
  // A leading = + - @ (or tab/CR) makes Excel/Sheets evaluate the cell as a formula.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
