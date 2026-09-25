import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Job, Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';
import { bullConnection } from '../bookings/booking-queue.js';
import { RemindersService } from './reminders.service.js';
import { ReviewsService } from './reviews.service.js';
import { reportJobFailure } from '../../common/observability/report.js';

export const RENTALS_QUEUE = 'rentals';
const QUEUE = RENTALS_QUEUE;

export const RentalJob = {
  /** Pickup, return and overdue reminders. */
  REMINDERS: 'reminders',
  /** One-sided reviews go public after 7 days. */
  PUBLISH_REVIEWS: 'publish-reviews',
} as const;

/** Hourly rental jobs (only when JOBS_WORKER is on; tests call `process`). */
@Injectable()
export class RentalsWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RentalsWorker.name);
  private queue?: Queue;
  private worker?: Worker;
  private connections: Redis[] = [];

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly reminders: RemindersService,
    private readonly reviews: ReviewsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('JOBS_WORKER', { infer: true })) return;
    const url = this.config.get('REDIS_URL', { infer: true });
    this.connections = [bullConnection(url), bullConnection(url)];
    this.queue = new Queue(QUEUE, {
      connection: this.connections[0]!,
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: 100 },
    });
    this.worker = new Worker(QUEUE, (job) => this.process(job), {
      connection: this.connections[1]!,
    });
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Rental job ${job?.name} failed: ${err.message}`);
      reportJobFailure(QUEUE, job, err);
    });
    for (const name of Object.values(RentalJob)) {
      await this.queue.upsertJobScheduler(name, { every: 60 * 60_000 }, { name });
    }
  }

  async process(job: Pick<Job, 'name'>, now = new Date()): Promise<number> {
    switch (job.name) {
      case RentalJob.REMINDERS:
        return this.reminders.run(now);
      case RentalJob.PUBLISH_REVIEWS:
        return this.reviews.publishDue(now);
      default:
        this.logger.warn(`Unknown job ${job.name}`);
        return 0;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    for (const c of this.connections) c.disconnect();
  }
}
