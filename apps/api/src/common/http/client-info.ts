import { timingSafeEqual } from 'node:crypto';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

/**
 * The website calls the API from its own server, so every web visitor would
 * otherwise share that server's IP (and its OTP and read limits). The web
 * server proves itself with WEB_CLIENT_SECRET and passes the visitor's IP and
 * browser on; any other caller's copies of these headers are ignored.
 */
export const WEB_HEADERS = {
  key: 'x-nivra-web-key',
  ip: 'x-nivra-client-ip',
  userAgent: 'x-nivra-client-ua',
} as const;

const IP = /^[0-9a-fA-F:.]{2,45}$/;

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function fromTrustedWebServer(req: Request): boolean {
  const secret = process.env.WEB_CLIENT_SECRET;
  const sent = header(req, WEB_HEADERS.key);
  if (!secret || !sent) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clientInfoFrom(req: Request): ClientInfo {
  let ip = req.ip;
  let ua = header(req, 'user-agent');
  if (fromTrustedWebServer(req)) {
    const forwardedIp = header(req, WEB_HEADERS.ip)?.trim();
    if (forwardedIp && IP.test(forwardedIp)) ip = forwardedIp;
    ua = header(req, WEB_HEADERS.userAgent) ?? ua;
  }
  return { ip, userAgent: ua?.slice(0, 512) };
}

/** Injects the caller's IP and user agent: `@Client() client: ClientInfo`. */
export const Client = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  clientInfoFrom(ctx.switchToHttp().getRequest<Request>()),
);
