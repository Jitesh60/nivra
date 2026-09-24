import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';
import { EmailProvider, type EmailMessage } from '../../providers/email/email.provider.js';
import { bullConnection } from '../bookings/booking-queue.js';
import { EMAIL_QUEUE } from './mailer.service.js';
import { reportJobFailure } from '../../common/observability/report.js';

/** Sends queued emails (JOBS_WORKER processes only); failures retry with backoff. */
@Injectable()
export class MailWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MailWorker.name);
  private worker?: Worker<EmailMessage>;
  private connection?: Redis;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly email: EmailProvider,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('JOBS_WORKER', { infer: true })) return;
    this.connection = bullConnection(this.config.get('REDIS_URL', { infer: true }));
    this.worker = new Worker<EmailMessage>(EMAIL_QUEUE, (job) => this.process(job.data), {
      connection: this.connection,
      concurrency: 5,
    });
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Email ${job?.id} failed (try ${job?.attemptsMade}): ${err.message}`);
      reportJobFailure(EMAIL_QUEUE, job, err);
    });
  }

  process(message: EmailMessage): Promise<void> {
    return this.email.send(message);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
