import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Env } from '../../config/env.js';
import type { AuthRealm } from '../../generated/prisma/client.js';

/** Token types. Each is only accepted where it is meant to be used. */
export type TokenType = 'user' | 'admin' | 'admin_mfa';

export interface AccessClaims {
  sub: string;
  /** Session id. Absent on admin_mfa tokens. */
  sid?: string;
  typ: TokenType;
}

export interface SignedToken {
  token: string;
  expiresInSec: number;
}

export const ADMIN_MFA_TOKEN_TTL_SEC = 5 * 60;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  signAccess(realm: AuthRealm, subjectId: string, sessionId: string): SignedToken {
    const typ: TokenType = realm === 'ADMIN' ? 'admin' : 'user';
    return this.sign({ sub: subjectId, sid: sessionId, typ }, this.ttl(typ));
  }

  signAdminMfa(adminId: string): SignedToken {
    return this.sign({ sub: adminId, typ: 'admin_mfa' }, ADMIN_MFA_TOKEN_TTL_SEC);
  }

  /** Verifies signature, expiry and type. Throws TOKEN_INVALID / TOKEN_EXPIRED. */
  verify(token: string, typ: TokenType): AccessClaims {
    let claims: AccessClaims;
    try {
      claims = this.jwt.verify<AccessClaims>(token, {
        secret: this.secret(typ),
        algorithms: ['HS256'],
      });
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        throw new AppException(ErrorCode.TOKEN_EXPIRED, 'Token expired', HttpStatus.UNAUTHORIZED);
      }
      throw invalidToken();
    }
    if (claims.typ !== typ || typeof claims.sub !== 'string') throw invalidToken();
    if (typ !== 'admin_mfa' && typeof claims.sid !== 'string') throw invalidToken();
    return claims;
  }

  private sign(claims: AccessClaims, expiresInSec: number): SignedToken {
    const token = this.jwt.sign(claims, {
      secret: this.secret(claims.typ),
      algorithm: 'HS256',
      expiresIn: expiresInSec,
    });
    return { token, expiresInSec };
  }

  /** Users and admins use different keys, so a token from one realm is useless in the other. */
  private secret(typ: TokenType): string {
    return typ === 'user'
      ? this.config.get('JWT_ACCESS_SECRET', { infer: true })
      : this.config.get('JWT_ADMIN_ACCESS_SECRET', { infer: true });
  }

  private ttl(typ: 'user' | 'admin'): number {
    return typ === 'admin'
      ? this.config.get('ADMIN_ACCESS_TOKEN_TTL_SEC', { infer: true })
      : this.config.get('ACCESS_TOKEN_TTL_SEC', { infer: true });
  }
}

export function invalidToken(): AppException {
  return new AppException(ErrorCode.TOKEN_INVALID, 'Invalid token', HttpStatus.UNAUTHORIZED);
}
