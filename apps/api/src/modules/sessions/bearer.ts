import type { Request } from 'express';
import { invalidToken } from './token.service.js';

export function bearerToken(req: Request): string {
  const header = req.headers.authorization;
  const [scheme, token] = header?.split(' ') ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw invalidToken();
  return token;
}
