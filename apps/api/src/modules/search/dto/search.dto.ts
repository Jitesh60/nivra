import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CategoryDto } from '../../categories/dto/category.dto.js';
import { ITEM_CONDITIONS } from '../../listings/dto/listing.dto.js';

export const SEARCH_SORTS = ['distance', 'relevance', 'price_asc', 'price_desc', 'newest'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

const toArray = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Array.isArray(value) ? value : String(value).split(',');
const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : value;

export class DateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-10-02', format: 'date', description: 'Pickup day' })
  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-10-05',
    format: 'date',
    description: 'Return day (inclusive)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;
}

export class AreaQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ example: 18.5074 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;
  @ApiPropertyOptional({ example: 73.8077 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

export class SearchQueryDto extends AreaQueryDto {
  @ApiPropertyOptional({
    example: 'trekking tent',
    description: 'Keywords (stemmed: "tents" finds "tent")',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  radiusKm: number = 5;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() categoryId?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPricePaise?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPricePaise?: number;

  @ApiPropertyOptional({
    enum: ITEM_CONDITIONS,
    isArray: true,
    description: 'Repeat or comma-separate',
  })
  @IsOptional()
  @Transform(toArray)
  @IsIn(ITEM_CONDITIONS, { each: true })
  condition?: string[];

  @ApiPropertyOptional({ description: 'Only lenders with an approved ID' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  verifiedLendersOnly?: boolean;

  @ApiPropertyOptional({
    enum: SEARCH_SORTS,
    description: 'Default: relevance with keywords, else distance with a location, else newest',
  })
  @IsOptional()
  @IsIn(SEARCH_SORTS)
  sort?: SearchSort;

  @ApiPropertyOptional({ description: 'From the previous page’s nextCursor' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit: number = 20;
}

export class CardsQueryDto {
  @ApiProperty({ description: 'Up to 20 listing ids, comma-separated' })
  @Transform(toArray)
  @IsUUID('all', { each: true })
  ids: string[];
}

export class CardLenderDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiPropertyOptional({ type: String, nullable: true }) name: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl: string | null;
  @ApiProperty() idVerified: boolean;
}

export class ListingCardDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: CategoryDto }) category: CategoryDto;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Cover photo, card size' })
  thumbUrl: string | null;
  @ApiProperty() pricePerDayPaise: number;
  @ApiProperty() weeklyDiscountPct: number;
  @ApiProperty() depositPaise: number;
  @ApiPropertyOptional({ type: String, nullable: true }) areaLabel: string | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Rounded to 0.5 km; under 1 km is reported as 0.5 ("< 1 km")',
  })
  distanceKm: number | null;
  @ApiProperty({ type: CardLenderDto }) lender: CardLenderDto;
  @ApiProperty({ description: 'In the signed-in user’s wishlist' }) saved: boolean;
  @ApiProperty({ description: 'Still live (wishlists keep items that were taken down)' })
  available: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Rent for the searched dates' })
  rentPaise: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) days: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Borrowers’ average rating' })
  ratingAvg: number | null;
  @ApiProperty() ratingCount: number;
}

export class SearchPageDto {
  @ApiProperty({ type: [ListingCardDto] }) items: ListingCardDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor: string | null;
  @ApiProperty({ enum: SEARCH_SORTS, description: 'The sort that was applied' }) sort: string;
}

export class HomeDto {
  @ApiProperty({ type: [CategoryDto] }) categories: CategoryDto[];
  @ApiProperty({ type: [ListingCardDto], description: 'Closest within 10 km (needs lat/lng)' })
  nearYou: ListingCardDto[];
  @ApiProperty({ type: [ListingCardDto], description: 'Most viewed and saved in the last 7 days' })
  popularThisWeek: ListingCardDto[];
  @ApiProperty({ type: [ListingCardDto] }) newest: ListingCardDto[];
}

export class QuoteQueryDto {
  @ApiProperty({ example: '2026-10-02', format: 'date' })
  @IsDateString({ strict: true })
  startDate: string;
  @ApiProperty({ example: '2026-10-05', format: 'date' })
  @IsDateString({ strict: true })
  endDate: string;
}

export class QuoteDto {
  @ApiProperty({ description: 'Inclusive: pickup day to return day' }) days: number;
  @ApiProperty() pricePerDayPaise: number;
  @ApiProperty() rentBeforeDiscountPaise: number;
  @ApiProperty() weeklyDiscountPaise: number;
  @ApiProperty() rentPaise: number;
  @ApiProperty({ description: 'Borrower service fee (₹0 for now)' }) feePaise: number;
  @ApiProperty({ description: 'Refundable' }) depositPaise: number;
  @ApiProperty() totalPaise: number;
  @ApiProperty() available: boolean;
  @ApiPropertyOptional({
    enum: ['BLOCKED', 'TOO_SHORT', 'TOO_LONG', 'NOT_ENOUGH_NOTICE'],
    nullable: true,
  })
  unavailableReason: string | null;
}
