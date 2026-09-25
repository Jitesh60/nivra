import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';
import { bullConnection } from '../bookings/booking-queue.js';

export const DISCOVERY_QUEUE = 'discovery';

/** Job names on the discovery queue (Phase 10). */
export const DiscoveryJob = {
  /** A listing just went live: alert the saved searches it matches. */
  MATCH_LISTING: 'match-listing',
  /** A request was posted: tell lenders nearby who have something similar. */
  NOTIFY_REQUEST: 'notify-request',
  /** Hourly: close requests past their expiry. */
  EXPIRE_REQUESTS: 'expire-requests',
} as const;

export interface ListingJobData {
  listingId: string;
}
export interface RequestJobData {
  requestId: string;
}

/**
 * Schedules discovery work. The job worker (discovery-worker.ts) runs it; each
 * job id is derived from what it's about, so adding one twice is a no-op.
 * Never throws: a failed enqueue must not fail publishing or posting.
 */
@Injectable()
export class DiscoveryQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(DiscoveryQueue.name);
  private readonly connection: Redis;
  readonly queue: Queue;

  constructor(config: ConfigService<Env, true>) {
    this.connection = bullConnection(config.get('REDIS_URL', { infer: true }));
    this.queue = new Queue(DISCOVERY_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 1000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    });
  }

  listingLive(listingId: string): Promise<void> {
    return this.add(DiscoveryJob.MATCH_LISTING, { listingId }, `match-${listingId}`);
  }

  requestPosted(requestId: string): Promise<void> {
    return this.add(DiscoveryJob.NOTIFY_REQUEST, { requestId }, `notify-${requestId}`);
  }

  async ensureSchedules(): Promise<void> {
    await this.queue.upsertJobScheduler(
      DiscoveryJob.EXPIRE_REQUESTS,
      { every: 60 * 60_000 },
      { name: DiscoveryJob.EXPIRE_REQUESTS },
    );
  }

  private async add(name: string, data: object, jobId: string): Promise<void> {
    try {
      await this.queue.add(name, data, { jobId });
    } catch (err) {
      this.logger.warn(
        `Could not queue ${name} (${jobId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
