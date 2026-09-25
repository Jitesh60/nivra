import { Prisma } from '../../generated/prisma/client.js';

/** Referral credit rules (Phase 10; PRD §7). */
export const REFERRAL_RULES = {
  /** Credit a new person gets for entering an invite code. */
  refereeCreditPaise: 10_000,
  /** Credit the inviter gets when that person's first rental completes. */
  referrerCreditPaise: 10_000,
  /** Rewards one inviter can earn in total. */
  maxReferrerRewards: 20,
  /** A code can be entered this many days after signing up (and before any booking). */
  redeemWithinDays: 7,
  /** Credit covers at most this share of a booking's rent (basis points). */
  maxShareOfRentBps: 5_000,
} as const;

type Db = Prisma.TransactionClient;

/** The most credit a booking with [rentPaise] of rent can use. */
export function creditLimitFor(rentPaise: number): number {
  return Math.floor((rentPaise * REFERRAL_RULES.maxShareOfRentBps) / 10_000);
}

/** Unspent credit: every entry summed (grants add, holds and revokes subtract). */
export async function creditBalance(db: Db, userId: string): Promise<number> {
  const sum = await db.creditEntry.aggregate({ where: { userId }, _sum: { amountPaise: true } });
  return sum._sum.amountPaise ?? 0;
}

/**
 * Serialises credit changes for one person inside the caller's transaction,
 * so two bookings can't spend the same credit.
 */
export async function lockCredit(tx: Db, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`credit:${userId}`}, 0))`;
}

/**
 * Takes credit off a new booking's rent: as much as the person has, up to the
 * limit for that rent. Returns the amount held (0 when they have none).
 * Must run in the transaction that creates the booking.
 */
export async function holdCredit(
  tx: Db,
  userId: string,
  bookingId: string,
  rentPaise: number,
): Promise<number> {
  await lockCredit(tx, userId);
  const amount = Math.min(await creditBalance(tx, userId), creditLimitFor(rentPaise));
  if (amount <= 0) return 0;
  await tx.creditEntry.create({
    data: { userId, bookingId, amountPaise: -amount, kind: 'HOLD' },
  });
  return amount;
}

/**
 * Gives a booking's credit back to the borrower's balance: all of it when the
 * booking didn't go ahead before payment, or [amountPaise] of it after a paid
 * cancellation. At most once per booking; returns what was given back.
 */
export async function releaseCredit(
  db: Db,
  bookingId: string,
  amountPaise?: number,
): Promise<number> {
  const hold = await db.creditEntry.findFirst({ where: { bookingId, kind: 'HOLD' } });
  if (!hold) return 0;
  const amount = Math.min(-hold.amountPaise, amountPaise ?? -hold.amountPaise);
  if (amount <= 0) return 0;
  try {
    await db.creditEntry.create({
      data: { userId: hold.userId, bookingId, amountPaise: amount, kind: 'RELEASE' },
    });
  } catch (err) {
    // Already given back (a retried cancellation).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 0;
    throw err;
  }
  return amount;
}

/**
 * Of a paid booking's cancellation refund of [refundRentPaise] rent, the part
 * that goes back as credit (the rest is cash): credit is returned first, so
 * the borrower never gets cash for rent they paid with credit.
 */
export function creditBackFor(creditPaise: number, refundRentPaise: number): number {
  return Math.max(0, Math.min(creditPaise, refundRentPaise));
}
