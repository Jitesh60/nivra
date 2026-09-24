import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard, type UserAuth } from './jwt-auth.guard.js';

type MaybeAuthedRequest = Request & { userAuth?: UserAuth };

/**
 * For public routes that personalise when signed in (saved flags, views).
 * No Authorization header: a guest, allowed. A header: it must be valid, like
 * JwtAuthGuard (a stale token gets 401, so the app refreshes it rather than
 * silently browsing as a guest).
 */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtAuthGuard) {}

  canActivate(ctx: ExecutionContext): Promise<boolean> | boolean {
    const req = ctx.switchToHttp().getRequest<MaybeAuthedRequest>();
    if (!req.headers.authorization) return true;
    return this.jwt.canActivate(ctx);
  }
}

/** The signed-in user, or undefined for a guest. Use with OptionalJwtGuard. */
export const OptionalUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UserAuth | undefined =>
    ctx.switchToHttp().getRequest<MaybeAuthedRequest>().userAuth,
);
