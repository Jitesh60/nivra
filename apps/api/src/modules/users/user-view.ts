import type { Prisma } from '../../generated/prisma/client.js';

/** Documents that currently earn the "ID verified" badge. */
export function badgeDocumentsWhere(now = new Date()): Prisma.UserDocumentWhereInput {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    status: 'APPROVED',
    deletedAt: null,
    OR: [{ expiresOn: null }, { expiresOn: { gte: today } }],
  };
}

/** Everything UserDto needs, in one query. */
export function userViewInclude() {
  return {
    profile: true,
    _count: { select: { documents: { where: badgeDocumentsWhere() } } },
  } satisfies Prisma.UserInclude;
}

export type UserView = Prisma.UserGetPayload<{ include: ReturnType<typeof userViewInclude> }>;
