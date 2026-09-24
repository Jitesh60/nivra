import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { AdminRole } from '../../generated/prisma/client.js';
import { bearerToken } from '../sessions/bearer.js';
import { suspended, SessionsService } from '../sessions/sessions.service.js';
import { invalidToken, TokenService } from '../sessions/token.service.js';

export interface AdminAuth {
  adminId: string;
  sessionId: string;
  role: AdminRole;
}

type AdminRequest = Request & { adminAuth?: AdminAuth };

const ROLES_KEY = 'admin:roles';
const ALLOW_PENDING_PASSWORD_KEY = 'admin:allowPendingPassword';

/** Restricts an admin route to these roles. No decorator = any admin role. */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

/** Lets an admin who must change their password still reach this route. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

/**
 * Admin access tokens only (users' tokens use a different key and fail here).
 * Checks the session is live, the admin is active, the role is allowed and that
 * a required password change has been done.
 */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const claims = this.tokens.verify(bearerToken(req), 'admin');
    const session = await this.sessions.findActive(claims.sid!, 'ADMIN');
    const admin = session?.adminUser;
    if (!session || !admin || admin.id !== claims.sub) throw invalidToken();
    if (admin.status !== 'ACTIVE') throw suspended();

    const targets = [ctx.getHandler(), ctx.getClass()];
    const allowPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_KEY,
      targets,
    );
    if (admin.mustChangePassword && !allowPending) {
      throw new AppException(
        ErrorCode.PASSWORD_CHANGE_REQUIRED,
        'Please change your temporary password first',
        HttpStatus.FORBIDDEN,
      );
    }

    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(admin.role)) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Your role does not allow this action',
        HttpStatus.FORBIDDEN,
      );
    }

    req.adminAuth = { adminId: admin.id, sessionId: session.id, role: admin.role };
    return true;
  }
}

/** The authenticated admin: `@CurrentAdmin() auth: AdminAuth`. Requires AdminJwtGuard. */
export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminAuth =>
    ctx.switchToHttp().getRequest<AdminRequest>().adminAuth!,
);
