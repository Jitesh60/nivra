import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Job, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';
import { reportJobFailure } from '../../common/observability/report.js';
import { bullConnection } from '../bookings/booking-queue.js';
import { RequestsService } from '../requests/requests.service.js';
import {
  DISCOVERY_QUEUE,
  DiscoveryJob,
  DiscoveryQueue,
  type ListingJobData,
  type RequestJobData,
} from './discovery-queue.js';
import { SearchAlertsService } from './search-alerts.service.js';

/** Runs discovery jobs (only when JOBS_WORKER is on; tests call `process`). */
@Injectable()
export class DiscoveryWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DiscoveryWorker.name);
  private worker?: Worker;
  private connection?: Redis;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly queue: DiscoveryQueue,
    private readonly alerts: SearchAlertsService,
    private readonly requests: RequestsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('JOBS_WORKER', { infer: true })) return;
    this.connection = bullConnection(this.config.get('REDIS_URL', { infer: true }));
    this.worker = new Worker(DISCOVERY_QUEUE, (job) => this.process(job), {
      connection: this.connection,
    });
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Discovery job ${job?.name} failed: ${err.message}`);
      reportJobFailure(DISCOVERY_QUEUE, job, err);
    });
    await this.queue.ensureSchedules();
  }

  async process(job: Pick<Job, 'name' | 'data'>, now = new Date()): Promise<number> {
    switch (job.name) {
      case DiscoveryJob.MATCH_LISTING:
        return this.alerts.matchListing((job.data as ListingJobData).listingId, now);
      case DiscoveryJob.NOTIFY_REQUEST:
        return this.requests.notifyNearby((job.data as RequestJobData).requestId);
      case DiscoveryJob.EXPIRE_REQUESTS:
        return this.requests.expireDue(now);
      default:
        this.logger.warn(`Unknown job ${job.name}`);
        return 0;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
