import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';

export const BOOKINGS_QUEUE = 'bookings';

/** Job names on the bookings queue. */
export const BookingJob = {
  /** One booking's step timed out (delayed job; re-checked before acting). */
  EXPIRE: 'expire',
  /** Safety net: expire anything whose delayed job was lost. */
  SWEEP: 'sweep-expired',
  /** Delete shared document copies after the retention window. */
  PURGE: 'purge-shares',
} as const;

export interface ExpireJobData {
  bookingId: string;
}

/** BullMQ needs a connection that retries forever (it blocks on Redis). */
export function bullConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

/**
 * Schedules booking timers. The worker (booking-worker.ts) runs them; every
 * job re-checks the booking before acting, so a stale or duplicate job is harmless.
 */
@Injectable()
export class BookingQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(BookingQueue.name);
  private readonly connection: Redis;
  readonly queue: Queue;

  constructor(config: ConfigService<Env, true>) {
    this.connection = bullConnection(config.get('REDIS_URL', { infer: true }));
    this.queue = new Queue(BOOKINGS_QUEUE, {
      connection: this.connection,
      defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 1000, attempts: 3 },
    });
  }

  /** Runs the expiry check for [bookingId] at [at]. Never throws (the sweep catches misses). */
  async scheduleExpiry(bookingId: string, at: Date): Promise<void> {
    try {
      await this.queue.add(BookingJob.EXPIRE, { bookingId } satisfies ExpireJobData, {
        // Same booking and deadline → same job, so scheduling twice is a no-op.
        jobId: `expire-${bookingId}-${at.getTime()}`,
        delay: Math.max(0, at.getTime() - Date.now()),
        backoff: { type: 'exponential', delay: 5_000 },
      });
    } catch (err) {
      this.logger.warn(
        `Could not schedule expiry of ${bookingId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** The repeating jobs (idempotent: upsert by id). */
  async ensureSchedules(): Promise<void> {
    await this.queue.upsertJobScheduler(
      BookingJob.SWEEP,
      { every: 5 * 60_000 },
      {
        name: BookingJob.SWEEP,
      },
    );
    // 03:00 IST every day.
    await this.queue.upsertJobScheduler(
      BookingJob.PURGE,
      { pattern: '0 3 * * *', tz: 'Asia/Kolkata' },
      { name: BookingJob.PURGE },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
