import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ITEM_CONDITIONS } from '../../listings/dto/listing.dto.js';

/** The part of a search that is saved: everything but dates, sort and paging. */
export class SavedSearchFiltersDto {
  @ApiPropertyOptional({ example: 'tent' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiProperty({ example: 18.5074 }) @IsLatitude() lat: number;
  @ApiProperty({ example: 73.8077 }) @IsLongitude() lng: number;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 25 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(25)
  radiusKm: number = 5;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) minPricePaise?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) maxPricePaise?: number;

  @ApiPropertyOptional({ enum: ITEM_CONDITIONS, isArray: true })
  @IsOptional()
  @IsIn(ITEM_CONDITIONS, { each: true })
  condition?: string[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() verifiedLendersOnly?: boolean;
}

export class CreateSavedSearchDto {
  @ApiPropertyOptional({
    example: 'Tents near Kothrud',
    description: 'Suggested from the filters when left out',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiProperty({ type: SavedSearchFiltersDto })
  @ValidateNested()
  @Type(() => SavedSearchFiltersDto)
  filters: SavedSearchFiltersDto;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() alertsEnabled?: boolean;
}

export class UpdateSavedSearchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() alertsEnabled?: boolean;
}

export class SavedSearchDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: SavedSearchFiltersDto }) filters: SavedSearchFiltersDto;
  @ApiProperty() alertsEnabled: boolean;
  @ApiProperty() createdAt: Date;
}

export class SavedSearchResultsQueryDto {
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
