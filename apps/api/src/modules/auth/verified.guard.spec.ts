import type { ExecutionContext } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { VerifiedGuard } from './verified.guard.js';

function context(userAuth?: { userId: string }) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ userAuth }) }),
  } as unknown as ExecutionContext;
}

function guard(user: { phoneVerifiedAt: Date | null; emailVerifiedAt: Date | null } | null) {
  const prisma = { user: { findUnique: vi.fn(async () => user) } } as unknown as PrismaService;
  return new VerifiedGuard(prisma);
}

describe('VerifiedGuard', () => {
  it('lets fully verified users through', async () => {
    await expect(
      guard({ phoneVerifiedAt: new Date(), emailVerifiedAt: new Date() }).canActivate(
        context({ userId: 'u' }),
      ),
    ).resolves.toBe(true);
  });

  it('names what is missing', async () => {
    await expect(
      guard({ phoneVerifiedAt: new Date(), emailVerifiedAt: null }).canActivate(
        context({ userId: 'u' }),
      ),
    ).rejects.toMatchObject({ code: 'VERIFICATION_REQUIRED', details: { missing: ['email'] } });
  });

  it('rejects when there is no authenticated user', async () => {
    await expect(guard(null).canActivate(context())).rejects.toMatchObject({
      details: { missing: ['phone', 'email'] },
    });
  });
});
