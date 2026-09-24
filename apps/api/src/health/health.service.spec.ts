import type { Redis } from 'ioredis';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthService } from './health.service.js';

function makeService(db: () => Promise<unknown>, ping: () => Promise<unknown>) {
  const prisma = { $queryRaw: vi.fn(db) } as unknown as PrismaService;
  const redis = { ping: vi.fn(ping) } as unknown as Redis;
  return new HealthService(prisma, redis);
}

describe('HealthService', () => {
  it('reports ok when every dependency is up', async () => {
    const report = await makeService(
      async () => [1],
      async () => 'PONG',
    ).check();
    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('reports error when a dependency fails', async () => {
    const report = await makeService(
      async () => [1],
      async () => {
        throw new Error('ECONNREFUSED');
      },
    ).check();
    expect(report.status).toBe('error');
    expect(report.checks).toEqual({ database: 'up', redis: 'down' });
  });
});
