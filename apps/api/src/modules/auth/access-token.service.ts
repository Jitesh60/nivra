import { Injectable } from '@nestjs/common';
import { suspended, SessionsService } from '../sessions/sessions.service.js';
import { invalidToken, TokenService } from '../sessions/token.service.js';
import type { UserAuth } from './jwt-auth.guard.js';

export interface AuthenticatedUser extends UserAuth {
  /** When the access token stops being valid. */
  expiresAt: Date;
}

/**
 * Checks a user access token: signature and expiry, a live session, and an
 * active account. Shared by the HTTP guard and the chat socket handshake.
 * Throws TOKEN_INVALID / TOKEN_EXPIRED / ACCOUNT_SUSPENDED.
 */
@Injectable()
export class AccessTokenService {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionsService,
  ) {}

  async authenticate(token: string): Promise<AuthenticatedUser> {
    const claims = this.tokens.verify(token, 'user');
    const session = await this.sessions.findActive(claims.sid!, 'USER');
    if (!session || session.userId !== claims.sub || !session.user) throw invalidToken();
    if (session.user.status !== 'ACTIVE') throw suspended();
    return {
      userId: claims.sub,
      sessionId: session.id,
      expiresAt: new Date((claims.exp ?? 0) * 1000),
    };
  }
}
