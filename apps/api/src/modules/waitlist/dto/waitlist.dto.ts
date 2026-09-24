import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { WaitlistEntry } from '../../../generated/prisma/client.js';

const ROLES = ['BORROWER', 'LENDER', 'BOTH'] as const;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class JoinWaitlistDto {
  @ApiProperty({ example: 'rahul@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional({ example: 'Pune' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: (typeof ROLES)[number];

  @ApiPropertyOptional({ example: 'instagram', description: 'utm_source or referrer' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  source?: string;

  @ApiPropertyOptional({
    description: 'Honeypot. Hidden from people; bots fill it in. Must be empty.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class JoinWaitlistResponseDto {
  @ApiProperty() ok: true;

  @ApiProperty({ description: 'True if this email was already on the list' })
  alreadyJoined: boolean;
}

export class WaitlistEntryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiPropertyOptional({ type: String, nullable: true }) city: string | null;
  @ApiPropertyOptional({ enum: ROLES, nullable: true }) role: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) source: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;

  static from(e: WaitlistEntry): WaitlistEntryDto {
    return {
      id: e.id,
      email: e.email,
      city: e.city,
      role: e.role,
      source: e.source,
      createdAt: e.createdAt.toISOString(),
    };
  }
}

export class ListWaitlistQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;
}

export class WaitlistPageDto {
  @ApiProperty() total: number;
  @ApiProperty({ type: [WaitlistEntryDto] }) items: WaitlistEntryDto[];
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) nextCursor: string | null;
}
