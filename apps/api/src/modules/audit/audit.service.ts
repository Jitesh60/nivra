import { Injectable, Logger } from '@nestjs/common';
import type { ActorType, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface AuditEntry {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonObject;
  ip?: string;
}

/** Append-only audit trail. Never put OTPs, passwords or tokens in `metadata`. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.auditLog.create({ data: { ...entry, actorId: entry.actorId ?? null } });
    this.logger.log({ audit: entry.action, actorType: entry.actorType, actorId: entry.actorId });
  }
}
