import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppException } from '../common/errors/app.exception.js';
import { type ErrorCode as Code, ErrorCode } from '../common/errors/error-codes.js';
import { REDIS } from './redis.token.js';

export interface RateLimit {
  /** Redis key, e.g. `chat:send:${userId}`. */
  key: string;
  limit: number;
  windowSec: number;
  message?: string;
  code?: Code;
}

/**
 * Fixed-window counter in Redis. Over the limit it throws 429 with
 * `retryAfterSec` (the exception filter turns that into a Retry-After header).
 */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async hit({ key, limit, windowSec, message, code }: RateLimit): Promise<void> {
    const results = await this.redis.multi().incr(key).ttl(key).exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[1]?.[1] ?? -1);
    // First hit (or a key that somehow lost its expiry): start the window.
    if (ttl < 0) await this.redis.expire(key, windowSec);
    if (count > limit) {
      throw new AppException(
        code ?? ErrorCode.RATE_LIMITED,
        message ?? 'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfterSec: ttl > 0 ? ttl : windowSec },
      );
    }
  }
}
