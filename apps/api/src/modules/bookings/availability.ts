import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { todayUtc } from '../listings/listing-rules.js';
import { HELD_STATUSES } from './booking-rules.js';

export interface DateRange {
  startsOn: Date;
  endsOn: Date;
}

/**
 * Dates of a listing held by bookings (from AWAITING_PAYMENT on). They count
 * as unavailable alongside the lender's own blocks, which live in
 * `availability_blocks` and are replaced wholesale when the lender edits them.
 */
export async function heldRanges(
  prisma: PrismaService | Prisma.TransactionClient,
  listingId: string,
): Promise<DateRange[]> {
  return prisma.booking.findMany({
    where: { listingId, status: { in: [...HELD_STATUSES] }, endsOn: { gte: todayUtc() } },
    select: { startsOn: true, endsOn: true },
    orderBy: { startsOn: 'asc' },
  });
}

/** Search filter: no held booking overlaps [start, end] (SQL alias `l` is the listing). */
export function notHeldBetween(start: string, end: string): Prisma.Sql {
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM bookings bk
    WHERE bk.listing_id = l.id
      AND bk.status::text IN (${Prisma.join([...HELD_STATUSES])})
      AND bk.starts_on <= ${end}::date AND bk.ends_on >= ${start}::date
  )`;
}
