import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { JwtAuthGuard, type UserAuth } from './jwt-auth.guard.js';

/**
 * Requires a verified phone and email (PRD: needed before listing or booking).
 * Use via `@RequireVerified()`, which also applies JwtAuthGuard first.
 */
@Injectable()
export class VerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const auth = ctx.switchToHttp().getRequest<Request & { userAuth?: UserAuth }>().userAuth;
    const user = auth
      ? await this.prisma.user.findUnique({
          where: { id: auth.userId },
          select: { phoneVerifiedAt: true, emailVerifiedAt: true },
        })
      : null;
    const missing = [
      ...(!user?.phoneVerifiedAt ? ['phone'] : []),
      ...(!user?.emailVerifiedAt ? ['email'] : []),
    ];
    if (missing.length > 0) {
      throw new AppException(
        ErrorCode.VERIFICATION_REQUIRED,
        `Verify your ${missing.join(' and ')} first`,
        HttpStatus.FORBIDDEN,
        { missing },
      );
    }
    return true;
  }
}

export const RequireVerified = () => applyDecorators(UseGuards(JwtAuthGuard, VerifiedGuard));
