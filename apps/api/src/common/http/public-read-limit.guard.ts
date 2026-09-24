import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../config/env.js';
import { RateLimiter } from '../../redis/rate-limiter.js';

/**
 * Caps public reads (search, home, listings, reviews) per IP, so scraping or a
 * runaway client can't starve everyone else. Signed-in or not, it's per IP:
 * a whole office on one IP still gets PUBLIC_READ_LIMIT_PER_MIN a minute.
 */
@Injectable()
export class PublicReadLimitGuard implements CanActivate {
  private readonly limit: number;

  constructor(
    private readonly limiter: RateLimiter,
    config: ConfigService<Env, true>,
  ) {
    this.limit = config.get('PUBLIC_READ_LIMIT_PER_MIN', { infer: true });
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    await this.limiter.hit({
      key: `read:${req.ip ?? 'unknown'}`,
      limit: this.limit,
      windowSec: 60,
      message: 'You’re browsing very fast. Please wait a moment and try again.',
    });
    return true;
  }
}
