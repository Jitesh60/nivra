import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export function clientInfoFrom(req: Request): ClientInfo {
  const ua = req.headers['user-agent'];
  return { ip: req.ip, userAgent: typeof ua === 'string' ? ua.slice(0, 512) : undefined };
}

/** Injects the caller's IP and user agent: `@Client() client: ClientInfo`. */
export const Client = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  clientInfoFrom(ctx.switchToHttp().getRequest<Request>()),
);
