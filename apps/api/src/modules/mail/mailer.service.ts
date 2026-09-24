import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { EmailMessage } from '../../providers/email/email.provider.js';
import { bullConnection } from '../bookings/booking-queue.js';

export const EMAIL_QUEUE = 'email';

/** Who an email goes to: a verified address and the name to greet. */
export interface Recipient {
  email: string;
  name: string | null;
}

/**
 * Transactional email (not codes: those send at once in AuthService). Emails
 * go through a queue so a slow or failing provider never slows or fails the
 * action that caused them; the worker (mail-worker.ts) retries with backoff.
 */
@Injectable()
export class Mailer implements OnApplicationShutdown {
  private readonly logger = new Logger(Mailer.name);
  private readonly connection: Redis;
  readonly queue: Queue<EmailMessage>;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.connection = bullConnection(config.get('REDIS_URL', { infer: true }));
    this.queue = new Queue<EmailMessage>(EMAIL_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }

  /** The user's verified email, if they have one. */
  async verified(userId: string): Promise<Recipient | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true, name: true, status: true },
    });
    if (!u?.email || !u.emailVerifiedAt || u.status === 'DELETED') return null;
    return { email: u.email, name: u.name?.split(' ')[0] ?? null };
  }

  /** The verified email of a user who wants booking emails (the default). */
  async forBookings(userId: string): Promise<Recipient | null> {
    const prefs = await this.prisma.notificationPreferences.findUnique({
      where: { userId },
      select: { emailBookings: true },
    });
    if (prefs && !prefs.emailBookings) return null;
    return this.verified(userId);
  }

  /**
   * Queues [message]. [id] makes it once-only (the same id is ignored while
   * the job is kept). Never throws: an email must not fail what caused it.
   */
  async send(id: string, message: EmailMessage): Promise<void> {
    try {
      await this.queue.add('send', message, { jobId: id });
    } catch (err) {
      this.logger.warn(
        `Could not queue email ${id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
