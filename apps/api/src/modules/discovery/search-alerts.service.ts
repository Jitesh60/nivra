import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RateLimiter } from '../../redis/rate-limiter.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { filterConditions, PUBLIC_LISTINGS } from '../search/search-sql.js';
import type { SavedSearchFiltersDto } from '../search/dto/saved-search.dto.js';

/** A saved search pushes at most once in this many hours (the in-app notice always arrives). */
export const ALERT_PUSH_EVERY_HOURS = 6;
/** …and a person gets at most this many alert pushes a day. */
export const ALERT_PUSHES_PER_DAY = 5;
/** Safety cap on searches checked for one listing. */
const MAX_CANDIDATES = 2000;

interface Candidate {
  id: string;
  user_id: string;
  name: string;
  filters: SavedSearchFiltersDto;
  last_pushed_at: Date | null;
}

/**
 * Saved-search alerts. When a listing goes live, finds the saved searches it
 * would show up in (same SQL as search) and tells each person once.
 */
@Injectable()
export class SearchAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly limiter: RateLimiter,
  ) {}

  /** Returns how many people were told. */
  async matchListing(listingId: string, now = new Date()): Promise<number> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        lenderId: true,
        categoryId: true,
        status: true,
        title: true,
        areaLabel: true,
      },
    });
    if (!listing || listing.status !== 'LIVE') return 0;

    // Cheap prefilter on the GIST index: alerts on, the listing inside the
    // search's radius, same category (or any), not the lender, no block either way.
    const candidates = await this.prisma.$queryRaw<Candidate[]>`
      SELECT s.id::text, s.user_id::text, s.name, s.filters, s.last_pushed_at
      FROM saved_searches s
      JOIN users su ON su.id = s.user_id AND su.status = 'ACTIVE'
      JOIN listings l ON l.id = ${listing.id}::uuid
      WHERE s.alerts_enabled
        AND s.user_id <> l.lender_id
        AND (s.category_id IS NULL OR s.category_id = l.category_id)
        AND ST_DWithin(s.location, l.location, s.radius_km * 1000)
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = s.user_id AND b.blocked_id = l.lender_id)
             OR (b.blocker_id = l.lender_id AND b.blocked_id = s.user_id)
        )
      ORDER BY s.created_at
      LIMIT ${MAX_CANDIDATES}`;

    // One notice per person, for the first of their searches that really matches.
    const matched = new Map<string, Candidate>();
    for (const c of candidates) {
      if (matched.has(c.user_id)) continue;
      if (await this.matches(listing.id, c.filters)) matched.set(c.user_id, c);
    }

    for (const [userId, search] of matched) {
      const push = await this.mayPush(search, userId, now);
      if (push) {
        await this.prisma.savedSearch.update({
          where: { id: search.id },
          data: { lastPushedAt: now },
        });
      }
      await this.notifications.notify(
        userId,
        {
          type: 'search.alert',
          title: `New: ${listing.title}`,
          body: `Matches your saved search “${search.name}”${listing.areaLabel ? ` · ${listing.areaLabel}` : ''}`,
          listingId: listing.id,
        },
        { push },
      );
    }
    return matched.size;
  }

  /** Whether the live listing shows up in a search with [filters]. */
  async matches(listingId: string, filters: SavedSearchFiltersDto): Promise<boolean> {
    const where = [
      PUBLIC_LISTINGS,
      Prisma.sql`l.id = ${listingId}::uuid`,
      ...filterConditions(filters),
    ];
    const rows = await this.prisma.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM listings l JOIN users u ON u.id = l.lender_id
      WHERE ${Prisma.join(where, ' AND ')}
      LIMIT 1`;
    return rows.length > 0;
  }

  private async mayPush(search: Candidate, userId: string, now: Date): Promise<boolean> {
    const since = now.getTime() - ALERT_PUSH_EVERY_HOURS * 3_600_000;
    if (search.last_pushed_at && new Date(search.last_pushed_at).getTime() > since) return false;
    return this.limiter.tryHit({
      key: `search-alert:push:${userId}`,
      limit: ALERT_PUSHES_PER_DAY,
      windowSec: 24 * 3600,
    });
  }
}
