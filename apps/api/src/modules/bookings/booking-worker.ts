import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Job, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';
import { BookingDocumentsService } from './booking-documents.service.js';
import {
  BookingJob,
  BookingQueue,
  BOOKINGS_QUEUE,
  bullConnection,
  type ExpireJobData,
} from './booking-queue.js';
import { BookingsService } from './bookings.service.js';
import { reportJobFailure } from '../../common/observability/report.js';

/**
 * Runs the bookings queue in this process when JOBS_WORKER is on (the
 * default). It can later move to a separate process without code changes.
 */
@Injectable()
export class BookingWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BookingWorker.name);
  private worker?: Worker;
  private connection?: Redis;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly queue: BookingQueue,
    private readonly bookings: BookingsService,
    private readonly documents: BookingDocumentsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('JOBS_WORKER', { infer: true })) return;
    this.connection = bullConnection(this.config.get('REDIS_URL', { infer: true }));
    this.worker = new Worker(BOOKINGS_QUEUE, (job) => this.process(job), {
      connection: this.connection,
      concurrency: 5,
    });
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Job ${job?.name} ${job?.id} failed: ${err.message}`);
      reportJobFailure(BOOKINGS_QUEUE, job, err);
    });
    await this.queue.ensureSchedules();
  }

  /** One job. Public so tests can run jobs without waiting for their delay. */
  async process(job: Pick<Job, 'name' | 'data'>): Promise<unknown> {
    switch (job.name) {
      case BookingJob.EXPIRE:
        return this.bookings.expireIfDue((job.data as ExpireJobData).bookingId);
      case BookingJob.SWEEP:
        return this.bookings.expireDue();
      case BookingJob.PURGE:
        return this.documents.purgeClosed();
      default:
        this.logger.warn(`Unknown job ${job.name}`);
        return null;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
