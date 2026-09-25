import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';
import { bullConnection } from '../bookings/booking-queue.js';
import { PaymentsService } from './payments.service.js';
import { reportJobFailure } from '../../common/observability/report.js';

export const PAYMENTS_QUEUE = 'payments';
const QUEUE = PAYMENTS_QUEUE;

/** Every 5 minutes: refunds for cancelled paid bookings, and failed provider calls retried. */
@Injectable()
export class PaymentsWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PaymentsWorker.name);
  private queue?: Queue;
  private worker?: Worker;
  private connections: Redis[] = [];

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly payments: PaymentsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('JOBS_WORKER', { infer: true })) return;
    const url = this.config.get('REDIS_URL', { infer: true });
    this.connections = [bullConnection(url), bullConnection(url)];
    this.queue = new Queue(QUEUE, { connection: this.connections[0]! });
    this.worker = new Worker(QUEUE, () => this.payments.sweep(), {
      connection: this.connections[1]!,
    });
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Payments sweep ${job?.id} failed: ${err.message}`);
      reportJobFailure(QUEUE, job, err);
    });
    await this.queue.upsertJobScheduler('sweep', { every: 5 * 60_000 }, { name: 'sweep' });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    for (const c of this.connections) c.disconnect();
  }
}
