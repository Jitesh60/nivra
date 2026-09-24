import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { Prisma, type UserDocument } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { processDocument } from '../media/image-pipeline.js';
import { invalid, UploadsService } from '../media/uploads.service.js';
import type { DocumentTypeName } from './dto/document.dto.js';

export const VIEW_URL_TTL_SEC = 5 * 60;

export interface CreateDocumentInput {
  type: DocumentTypeName;
  label?: string;
  frontKey: string;
  backKey?: string;
  expiresOn?: string;
}

type Side = 'front' | 'back';
type Viewer = { actorType: 'USER' | 'ADMIN'; actorId: string };

/**
 * The personal document vault. Files are re-encoded (EXIF stripped) into the
 * private bucket; only 5-minute signed URLs leave the server, and every view
 * is written to the audit log.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly uploads: UploadsService,
    private readonly audit: AuditService,
  ) {}

  list(userId: string): Promise<UserDocument[]> {
    return this.prisma.userDocument.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    userId: string,
    input: CreateDocumentInput,
    client: ClientInfo,
  ): Promise<UserDocument> {
    await this.assertNoLiveDocument(userId, input.type);

    const sides: [Side, string][] = [['front', input.frontKey]];
    if (input.backKey) sides.push(['back', input.backKey]);

    const stored: Partial<Record<Side, string>> = {};
    // Only uploads this user successfully claimed are ours to discard.
    const claimed: string[] = [];
    try {
      for (const [side, uploadKey] of sides) {
        const bytes = await this.uploads.claim(userId, uploadKey, 'DOCUMENT');
        claimed.push(uploadKey);
        let jpeg: Buffer;
        try {
          jpeg = await processDocument(bytes);
        } catch {
          throw invalid(`The ${side} image could not be read. Try another photo.`);
        }
        const key = `documents/${userId}/${randomUUID()}-${side}.jpg`;
        await this.storage.put('private', key, jpeg, 'image/jpeg');
        stored[side] = key;
      }

      const document = await this.prisma.userDocument.create({
        data: {
          userId,
          type: input.type,
          label: input.label ?? null,
          frontKey: stored.front!,
          backKey: stored.back ?? null,
          expiresOn: input.expiresOn ? new Date(`${input.expiresOn}T00:00:00Z`) : null,
        },
      });
      await this.audit.log({
        actorType: 'USER',
        actorId: userId,
        action: 'user.document.upload',
        targetType: 'user_document',
        targetId: document.id,
        metadata: { type: input.type },
        ip: client.ip,
      });
      return document;
    } catch (err) {
      await this.storage.delete('private', [stored.front, stored.back]);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw alreadyExists();
      throw err;
    } finally {
      await this.uploads.discard(...claimed);
    }
  }

  /** Signed URL to one side of a document, logged in the audit trail. */
  async viewUrl(
    document: UserDocument,
    side: Side,
    viewer: Viewer,
    client: ClientInfo,
  ): Promise<{ url: string; expiresInSec: number }> {
    const key = side === 'back' ? document.backKey : document.frontKey;
    if (!key) throw notFound();
    const url = await this.storage.presignGet(key, VIEW_URL_TTL_SEC);
    await this.audit.log({
      ...viewer,
      action: viewer.actorType === 'ADMIN' ? 'admin.document.view' : 'document.view',
      targetType: 'user_document',
      targetId: document.id,
      metadata: { side, ownerId: document.userId },
      ip: client.ip,
    });
    return { url, expiresInSec: VIEW_URL_TTL_SEC };
  }

  async ownDocument(userId: string, id: string): Promise<UserDocument> {
    const document = await this.prisma.userDocument.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!document) throw notFound();
    return document;
  }

  /** Removes the document and its files for good. */
  async delete(userId: string, id: string, client: ClientInfo): Promise<void> {
    const document = await this.ownDocument(userId, id);
    await this.prisma.userDocument.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.storage.delete('private', [document.frontKey, document.backKey]);
    await this.audit.log({
      actorType: 'USER',
      actorId: userId,
      action: 'user.document.delete',
      targetType: 'user_document',
      targetId: id,
      metadata: { type: document.type },
      ip: client.ip,
    });
  }

  // ── Admin review ──

  queue(query: { status: 'PENDING' | 'APPROVED' | 'REJECTED'; cursor?: string; limit: number }) {
    // Pending: oldest first (fair queue). Reviewed: newest first.
    const pending = query.status === 'PENDING';
    return this.prisma.userDocument
      .findMany({
        where: {
          status: query.status,
          deletedAt: null,
          ...(query.cursor ? { id: pending ? { gt: query.cursor } : { lt: query.cursor } } : {}),
        },
        orderBy: { id: pending ? 'asc' : 'desc' },
        take: query.limit + 1,
        include: adminInclude,
      })
      .then((rows) => {
        const items = rows.slice(0, query.limit);
        return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
      });
  }

  async adminGet(id: string) {
    const document = await this.prisma.userDocument.findFirst({
      where: { id, deletedAt: null },
      include: adminInclude,
    });
    if (!document) throw notFound();
    return document;
  }

  async approve(adminId: string, id: string, client: ClientInfo) {
    return this.review(adminId, id, { status: 'APPROVED', rejectionReason: null }, client);
  }

  async reject(adminId: string, id: string, reason: string, client: ClientInfo) {
    return this.review(adminId, id, { status: 'REJECTED', rejectionReason: reason }, client);
  }

  private async review(
    adminId: string,
    id: string,
    outcome: { status: 'APPROVED' | 'REJECTED'; rejectionReason: string | null },
    client: ClientInfo,
  ) {
    const { count } = await this.prisma.userDocument.updateMany({
      where: { id, status: 'PENDING', deletedAt: null },
      data: { ...outcome, reviewedById: adminId, reviewedAt: new Date() },
    });
    if (count === 0) {
      await this.adminGet(id); // 404 if it doesn't exist at all
      throw new AppException(
        ErrorCode.DOCUMENT_NOT_PENDING,
        'This document was already reviewed',
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: outcome.status === 'APPROVED' ? 'admin.document.approve' : 'admin.document.reject',
      targetType: 'user_document',
      targetId: id,
      metadata: outcome.rejectionReason ? { reason: outcome.rejectionReason } : {},
      ip: client.ip,
    });
    return this.adminGet(id);
  }

  private async assertNoLiveDocument(userId: string, type: DocumentTypeName): Promise<void> {
    const live = await this.prisma.userDocument.count({
      where: { userId, type, deletedAt: null, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (live > 0) throw alreadyExists();
  }
}

export const adminInclude = {
  user: { select: { id: true, name: true, phone: true, email: true } },
  reviewedBy: { select: { name: true } },
} satisfies Prisma.UserDocumentInclude;

function notFound(): AppException {
  return new AppException(ErrorCode.NOT_FOUND, 'Document not found', HttpStatus.NOT_FOUND);
}

function alreadyExists(): AppException {
  return new AppException(
    ErrorCode.DOCUMENT_ALREADY_EXISTS,
    'You already have this type of document on file. Delete it first to upload a new one.',
    HttpStatus.CONFLICT,
  );
}
