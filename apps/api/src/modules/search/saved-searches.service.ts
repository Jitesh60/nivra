import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Prisma, SavedSearch } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateSavedSearchDto,
  SavedSearchDto,
  SavedSearchFiltersDto,
  SavedSearchResultsQueryDto,
  UpdateSavedSearchDto,
} from './dto/saved-search.dto.js';
import type { SearchPageDto } from './dto/search.dto.js';
import { SearchService } from './search.service.js';

/** Saved searches per person; alerts go out when a new listing matches (discovery worker). */
export const MAX_SAVED_SEARCHES = 10;

@Injectable()
export class SavedSearchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
  ) {}

  async list(userId: string): Promise<SavedSearchDto[]> {
    const rows = await this.prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async create(userId: string, dto: CreateSavedSearchDto): Promise<SavedSearchDto> {
    const f = clean(dto.filters);
    checkPrices(f);
    if ((await this.prisma.savedSearch.count({ where: { userId } })) >= MAX_SAVED_SEARCHES) {
      throw new AppException(
        ErrorCode.SAVED_SEARCH_LIMIT,
        `You can save up to ${MAX_SAVED_SEARCHES} searches. Delete one to save another.`,
        HttpStatus.CONFLICT,
      );
    }
    const row = await this.prisma.savedSearch.create({
      data: {
        userId,
        name: dto.name ?? (await this.suggestName(f)),
        filters: f as unknown as Prisma.InputJsonObject,
        categoryId: f.categoryId ?? null,
        lat: f.lat,
        lng: f.lng,
        radiusKm: f.radiusKm,
        alertsEnabled: dto.alertsEnabled ?? true,
      },
    });
    return toDto(row);
  }

  async update(userId: string, id: string, dto: UpdateSavedSearchDto): Promise<SavedSearchDto> {
    await this.own(userId, id);
    const row = await this.prisma.savedSearch.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.alertsEnabled !== undefined ? { alertsEnabled: dto.alertsEnabled } : {}),
      },
    });
    return toDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.own(userId, id);
    await this.prisma.savedSearch.delete({ where: { id } });
  }

  /** Runs the saved search now, like the search screen would. */
  async results(
    userId: string,
    id: string,
    query: SavedSearchResultsQueryDto,
  ): Promise<SearchPageDto> {
    const row = await this.own(userId, id);
    return this.search.search({ ...filtersOf(row), ...query }, userId);
  }

  private async own(userId: string, id: string): Promise<SavedSearch> {
    const row = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Saved search not found', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  /** "“tent” · Camping", "Camping" or "Everything", then the radius. */
  private async suggestName(f: SavedSearchFiltersDto): Promise<string> {
    const category = f.categoryId
      ? (await this.prisma.category.findUnique({ where: { id: f.categoryId } }))?.name
      : undefined;
    const what = [f.q ? `“${f.q}”` : null, category].filter(Boolean).join(' · ') || 'Everything';
    return `${what} within ${f.radiusKm} km`.slice(0, 60);
  }
}

export function filtersOf(row: Pick<SavedSearch, 'filters'>): SavedSearchFiltersDto {
  return row.filters as unknown as SavedSearchFiltersDto;
}

function toDto(row: SavedSearch): SavedSearchDto {
  return {
    id: row.id,
    name: row.name,
    filters: filtersOf(row),
    alertsEnabled: row.alertsEnabled,
    createdAt: row.createdAt,
  };
}

/** Only the known filter keys, without empty values (stored as JSON). */
function clean(f: SavedSearchFiltersDto): SavedSearchFiltersDto {
  const out: SavedSearchFiltersDto = { lat: f.lat, lng: f.lng, radiusKm: f.radiusKm ?? 5 };
  if (f.q) out.q = f.q;
  if (f.categoryId) out.categoryId = f.categoryId;
  if (f.minPricePaise !== undefined) out.minPricePaise = f.minPricePaise;
  if (f.maxPricePaise !== undefined) out.maxPricePaise = f.maxPricePaise;
  if (f.condition?.length) out.condition = [...new Set(f.condition)];
  if (f.verifiedLendersOnly) out.verifiedLendersOnly = true;
  return out;
}

function checkPrices(f: SavedSearchFiltersDto): void {
  if (
    f.minPricePaise !== undefined &&
    f.maxPricePaise !== undefined &&
    f.minPricePaise > f.maxPricePaise
  ) {
    throw new AppException(
      ErrorCode.VALIDATION_FAILED,
      'Request validation failed',
      HttpStatus.BAD_REQUEST,
      { 'filters.maxPricePaise': ['must be at least minPricePaise'] },
    );
  }
}
