import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { bearerToken } from '../sessions/bearer.js';
import { suspended, SessionsService } from '../sessions/sessions.service.js';
import { invalidToken, TokenService } from '../sessions/token.service.js';

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
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const claims = this.tokens.verify(bearerToken(req), 'user');
    const session = await this.sessions.findActive(claims.sid!, 'USER');
    if (!session || session.userId !== claims.sub || !session.user) throw invalidToken();
    if (session.user.status !== 'ACTIVE') throw suspended();
    req.userAuth = { userId: claims.sub, sessionId: session.id };
    return true;
  }
}

/** The authenticated user: `@CurrentUser() auth: UserAuth`. Requires JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UserAuth =>
    ctx.switchToHttp().getRequest<AuthedRequest>().userAuth!,
);
