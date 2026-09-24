import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import type { Category } from '../../../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CategoryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Trekking & outdoor gear' }) name: string;
  @ApiProperty({ example: 'trekking-outdoor' }) slug: string;
  @ApiProperty({ example: 'hiking', description: 'Material Symbols icon name' }) icon: string;

  static from(c: Category): CategoryDto {
    return { id: c.id, name: c.name, slug: c.slug, icon: c.icon };
  }
}

export class AdminCategoryDto extends CategoryDto {
  @ApiProperty() sortOrder: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ description: 'Listings in this category (any status except deleted)' })
  listingCount: number;

  static fromRow(c: Category & { _count: { listings: number } }): AdminCategoryDto {
    return {
      ...CategoryDto.from(c),
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      listingCount: c._count.listings,
    };
  }
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Musical instruments' })
  @Transform(trim)
  @IsString()
  @Length(2, 40)
  name: string;

  @ApiProperty({ example: 'musical-instruments', description: 'lowercase, digits and dashes' })
  @Transform(trim)
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase words joined by dashes',
  })
  slug: string;

  @ApiProperty({ example: 'music_note' })
  @Transform(trim)
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z0-9_]+$/, { message: 'icon must be a Material Symbols name, e.g. music_note' })
  icon: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 40) name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase words joined by dashes',
  })
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z0-9_]+$/, { message: 'icon must be a Material Symbols name, e.g. music_note' })
  icon?: string;

  @ApiPropertyOptional({ description: 'Hidden from the apps when false; existing listings stay' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CategoryOrderDto {
  @ApiProperty({ type: [String], description: 'Every category id, in the new order' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids: string[];
}
