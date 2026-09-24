import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { loginUser, uniqueEmail, type UserSession } from './auth.js';
import type { InMemorySmsProvider } from './in-memory-sms.js';

/** A signed-in user with a verified phone (by login) and email (set directly). */
export async function verifiedUser(
  app: INestApplication,
  sms: InMemorySmsProvider,
  name = 'Test User',
): Promise<UserSession> {
  const user = await loginUser(app, sms);
  await app.get(PrismaService).user.update({
    where: { id: user.userId },
    data: { email: uniqueEmail('verified'), emailVerifiedAt: new Date(), name },
  });
  return user;
}

/** A LIVE listing inserted directly (no review), in Pune unless told otherwise. */
export async function liveListing(
  app: INestApplication,
  lenderId: string,
  fields: Partial<{
    title: string;
    status: 'LIVE' | 'PAUSED';
    pricePerDayPaise: number;
    minDays: number;
    maxDays: number;
    advanceNoticeDays: number;
    blocks: { startsOn: Date; endsOn: Date }[];
    requiredDocs: ('GOVERNMENT_ID' | 'COLLEGE_OR_EMPLOYEE_ID' | 'ADDRESS_PROOF' | 'OTHER')[];
  }> = {},
): Promise<string> {
  const prisma = app.get(PrismaService);
  const category = await prisma.category.findFirstOrThrow({ where: { slug: 'trekking-outdoor' } });
  const listing = await prisma.listing.create({
    data: {
      lenderId,
      categoryId: category.id,
      title: fields.title ?? 'Quechua trekking tent',
      description: 'Two-person tent, used on three treks. Pegs included.',
      condition: 'GOOD',
      pricePerDayPaise: fields.pricePerDayPaise ?? 15_000,
      depositPaise: 100_000,
      minDays: fields.minDays ?? 1,
      maxDays: fields.maxDays ?? 30,
      advanceNoticeDays: fields.advanceNoticeDays ?? 0,
      lat: 18.5074,
      lng: 73.8077,
      areaLabel: 'Kothrud, Pune',
      status: fields.status ?? 'LIVE',
      publishedAt: new Date(),
      blocks: fields.blocks ? { create: fields.blocks } : undefined,
      requiredDocs: fields.requiredDocs
        ? {
            create: fields.requiredDocs.map((docType) => ({
              docType,
              note: docType === 'OTHER' ? 'Trek permit' : null,
            })),
          }
        : undefined,
    },
  });
  return listing.id;
}

/** YYYY-MM-DD, [offset] days from today (UTC). */
export const isoDay = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** Midnight UTC, [offset] days from today. */
export const utcDay = (offset: number) => new Date(`${isoDay(offset)}T00:00:00Z`);
