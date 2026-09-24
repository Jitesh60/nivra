import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { Prisma, type Category } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listActive(): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  listAll() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { listings: { where: { status: { not: 'DELETED' } } } } } },
    });
  }

  /** The category a listing may use: must exist and be active. */
  async assertActive(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category?.isActive) {
      throw new AppException(
        ErrorCode.CATEGORY_INACTIVE,
        'Choose one of the available categories',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async create(adminId: string, input: CreateCategoryDto, client: ClientInfo) {
    const last = await this.prisma.category.aggregate({ _max: { sortOrder: true } });
    const category = await this.write(() =>
      this.prisma.category.create({
        data: { ...input, sortOrder: (last._max.sortOrder ?? 0) + 10 },
      }),
    );
    await this.log(adminId, 'admin.category.create', category.id, { slug: category.slug }, client);
    return this.get(category.id);
  }

  async update(adminId: string, id: string, input: UpdateCategoryDto, client: ClientInfo) {
    await this.get(id);
    await this.write(() => this.prisma.category.update({ where: { id }, data: input }));
    await this.log(adminId, 'admin.category.update', id, { ...input }, client);
    return this.get(id);
  }

  async reorder(adminId: string, ids: string[], client: ClientInfo) {
    const existing = await this.prisma.category.findMany({ select: { id: true } });
    const known = new Set(existing.map((c) => c.id));
    if (
      ids.length !== known.size ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => known.has(id))
    ) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Send every category exactly once',
        HttpStatus.BAD_REQUEST,
        { ids: ['must list every category exactly once'] },
      );
    }
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.category.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } }),
      ),
    );
    await this.log(adminId, 'admin.category.reorder', null, {}, client);
    return this.listAll();
  }

  private async get(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { listings: { where: { status: { not: 'DELETED' } } } } } },
    });
    if (!category) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Category not found', HttpStatus.NOT_FOUND);
    }
    return category;
  }

  private async write<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(
          ErrorCode.CATEGORY_SLUG_TAKEN,
          'Another category already uses this slug',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  private log(
    adminId: string,
    action: string,
    targetId: string | null,
    metadata: Record<string, unknown>,
    client: ClientInfo,
  ) {
    return this.audit.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action,
      targetType: 'category',
      targetId: targetId ?? undefined,
      metadata: metadata as Prisma.InputJsonObject,
      ip: client.ip,
    });
  }
}
