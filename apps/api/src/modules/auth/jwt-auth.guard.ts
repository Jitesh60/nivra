import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { bearerToken } from '../sessions/bearer.js';
import { AccessTokenService } from './access-token.service.js';

export interface UserAuth {
  userId: string;
  sessionId: string;
}

type AuthedRequest = Request & { userAuth?: UserAuth };

/**
 * Accepts a user access token and checks, on every request, that its session is
 * still active and the user is not suspended. Revoking a session therefore
 * signs that device out immediately rather than when the token expires.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly accessTokens: AccessTokenService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const { userId, sessionId } = await this.accessTokens.authenticate(bearerToken(req));
    req.userAuth = { userId, sessionId };
    return true;
  }
}

/** The authenticated user: `@CurrentUser() auth: UserAuth`. Requires JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UserAuth =>
    ctx.switchToHttp().getRequest<AuthedRequest>().userAuth!,
);
