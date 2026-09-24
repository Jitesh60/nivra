import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { SearchSort } from './dto/search.dto.js';

/**
 * Distance a borrower sees: rounded to 0.5 km, and 0.5 for anything under
 * 1 km ("< 1 km"), so the exact pickup point can't be triangulated by
 * searching from a few places.
 */
export function roundDistanceKm(meters: number): number {
  if (meters < 1000) return 0.5;
  return Math.round(meters / 500) / 2;
}

interface Cursor {
  v: number;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    if (
      typeof c.v === 'number' &&
      Number.isFinite(c.v) &&
      typeof c.id === 'string' &&
      /^[0-9a-f-]{36}$/.test(c.id)
    ) {
      return c;
    }
  } catch {
    // fall through
  }
  throw new AppException(
    ErrorCode.VALIDATION_FAILED,
    'Request validation failed',
    HttpStatus.BAD_REQUEST,
    {
      cursor: ['is not a cursor from a previous page'],
    },
  );
}

/** The live, public listings of active lenders. */
export const PUBLIC_LISTINGS = Prisma.sql`l.status = 'LIVE' AND l.deleted_at IS NULL AND u.status = 'ACTIVE'`;

export function point(lat: number, lng: number): Prisma.Sql {
  return Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography`;
}

export function tsQuery(q: string): Prisma.Sql {
  return Prisma.sql`websearch_to_tsquery('english', ${q})`;
}

/** Free for the whole [start, end] stay, and within the listing's rules. */
export function availableBetween(start: string, end: string, days: number): Prisma.Sql {
  return Prisma.sql`
    NOT EXISTS (
      SELECT 1 FROM availability_blocks b
      WHERE b.listing_id = l.id AND b.starts_on <= ${end}::date AND b.ends_on >= ${start}::date
    )
    AND ${days}::int BETWEEN l.min_days AND l.max_days
    AND ${start}::date >= current_date + l.advance_notice_days`;
}

/** The lender has an approved, unexpired ID (same rule as the ID badge). */
export const LENDER_ID_VERIFIED = Prisma.sql`EXISTS (
  SELECT 1 FROM user_documents d
  WHERE d.user_id = l.lender_id AND d.status = 'APPROVED' AND d.deleted_at IS NULL
    AND (d.expires_on IS NULL OR d.expires_on >= current_date)
)`;

export interface SortSpec {
  expr: Prisma.Sql;
  desc: boolean;
}

export function sortSpec(
  sort: SearchSort,
  origin: Prisma.Sql | null,
  q: Prisma.Sql | null,
): SortSpec {
  switch (sort) {
    case 'distance':
      return { expr: Prisma.sql`ST_Distance(l.location, ${origin!})`, desc: false };
    case 'relevance':
      return { expr: Prisma.sql`ts_rank_cd(l.search_vector, ${q!})::float8`, desc: true };
    case 'price_asc':
      return { expr: Prisma.sql`l.price_per_day_paise::float8`, desc: false };
    case 'price_desc':
      return { expr: Prisma.sql`l.price_per_day_paise::float8`, desc: true };
    case 'newest':
      return {
        expr: Prisma.sql`extract(epoch from coalesce(l.published_at, l.created_at))::float8`,
        desc: true,
      };
  }
}

/** Keyset condition: rows after the cursor in (expr [desc], id asc) order. */
export function afterCursor(spec: SortSpec, c: Cursor): Prisma.Sql {
  return spec.desc
    ? Prisma.sql`(${spec.expr} < ${c.v}::float8 OR (${spec.expr} = ${c.v}::float8 AND l.id > ${c.id}::uuid))`
    : Prisma.sql`(${spec.expr} > ${c.v}::float8 OR (${spec.expr} = ${c.v}::float8 AND l.id > ${c.id}::uuid))`;
}
