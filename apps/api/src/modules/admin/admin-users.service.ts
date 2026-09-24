import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Read-only view of app users for the admin panel (Phase 1). */
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    search?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: User[]; nextCursor: string | null }> {
    const search = query.search;
    const digits = search?.replace(/\D/g, '');
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            ...(digits ? [{ phone: { contains: digits } }] : []),
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    // Newest first. IDs are UUID v7, so ordering by id is ordering by creation time.
    const rows = await this.prisma.user.findMany({
      where: { ...where, ...(query.cursor ? { id: { lt: query.cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }
}
