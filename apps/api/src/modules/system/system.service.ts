import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REDIS } from '../../redis/redis.token.js';
import { BOOKINGS_QUEUE } from '../bookings/booking-queue.js';
import { DISCOVERY_QUEUE } from '../discovery/discovery-queue.js';
import { EMAIL_QUEUE } from '../mail/mailer.service.js';
import { PAYMENTS_QUEUE } from '../payments/payments-worker.js';
import { RENTALS_QUEUE } from '../rentals/rentals-worker.js';
import type { DependencyLatencyDto, QueueStatusDto, SystemStatusDto } from './dto/system.dto.js';

export const SYSTEM_QUEUES = [
  BOOKINGS_QUEUE,
  EMAIL_QUEUE,
  PAYMENTS_QUEUE,
  RENTALS_QUEUE,
  DISCOVERY_QUEUE,
];

const TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS).unref(),
    ),
  ]);
}

/**
 * What an operator checks first: queue depth per BullMQ queue (is the worker
 * keeping up, is anything failing?) and how quickly the database and Redis answer.
 * Read-only: the queues here only count jobs, never add or run them.
 */
@Injectable()
export class SystemService implements OnApplicationShutdown {
  private readonly queues: Queue[];

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    // The shared connection is fine for counting (no blocking commands).
    this.queues = SYSTEM_QUEUES.map((name) => new Queue(name, { connection: redis }));
  }

  async status(): Promise<SystemStatusDto> {
    const [database, redis, queues] = await Promise.all([
      this.time(() => this.prisma.$queryRaw`SELECT 1`),
      this.time(() => this.redis.ping()),
      Promise.all(this.queues.map((q) => this.queue(q))),
    ]);
    return {
      version: process.env.GIT_SHA || 'dev',
      uptimeSec: Math.round(process.uptime()),
      database,
      redis,
      queues,
      generatedAt: new Date(),
    };
  }

  private async queue(queue: Queue): Promise<QueueStatusDto> {
    const counts = await withTimeout(
      queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
    ).catch(() => ({}) as Record<string, number>);
    const workers = await withTimeout(queue.getWorkersCount()).catch(() => null);
    return {
      name: queue.name,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      workers,
    };
  }

  private async time(fn: () => Promise<unknown>): Promise<DependencyLatencyDto> {
    const start = performance.now();
    try {
      await withTimeout(fn());
      return { status: 'up', latencyMs: Math.round((performance.now() - start) * 10) / 10 };
    } catch {
      return { status: 'down', latencyMs: null };
    }
  }

  async onApplicationShutdown(): Promise<void> {
    // Closes the queue objects only; the shared Redis connection is closed by RedisModule.
    await Promise.all(this.queues.map((q) => q.close().catch(() => undefined)));
  }
}
