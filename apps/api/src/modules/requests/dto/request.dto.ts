import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
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
} from 'class-validator';
import { CategoryDto } from '../../categories/dto/category.dto.js';
import { ListingCardDto } from '../../search/dto/search.dto.js';
import { ParticipantDto } from '../../safety/dto/safety.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateRequestDto {
  @ApiProperty({ example: '2-person tent for a weekend trek', maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  title: string;

  @ApiProperty({
    example: 'Going to Rajmachi on Saturday. Need it Friday evening.',
    maxLength: 500,
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  details: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() categoryId?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Most the borrower wants to pay per day' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  budgetPerDayPaise?: number;

  @ApiProperty({ example: 18.5074 }) @IsLatitude() lat: number;
  @ApiProperty({ example: 73.8077 }) @IsLongitude() lng: number;

  @ApiProperty({ example: 'Kothrud, Pune', description: 'Shown instead of the exact point' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  areaLabel: string;
}

export class ListRequestsQueryDto {
  @ApiProperty({ example: 18.5074 }) @Type(() => Number) @IsLatitude() lat: number;
  @ApiProperty({ example: 73.8077 }) @Type(() => Number) @IsLongitude() lng: number;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  radiusKm: number = 10;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() categoryId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit: number = 20;
}

export class RespondToRequestDto {
  @ApiProperty({ format: 'uuid', description: 'One of your LIVE listings' })
  @IsUUID()
  listingId: string;

  @ApiProperty({
    example: 'I have a 2-person tent, used twice. Free this weekend.',
    maxLength: 500,
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message: string;
}

export class RequestResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: ParticipantDto }) lender: ParticipantDto;
  @ApiPropertyOptional({
    type: ListingCardDto,
    nullable: true,
    description: 'Null when the listing is no longer live',
  })
  listing: ListingCardDto | null;
  @ApiProperty({ format: 'uuid', description: 'Open this chat' }) conversationId: string;
  @ApiProperty({ description: 'As the borrower saw it in the chat (contact details masked)' })
  message: string;
  @ApiProperty() createdAt: Date;
}

export class ItemRequestDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiProperty() details: string;
  @ApiPropertyOptional({ type: CategoryDto, nullable: true }) category: CategoryDto | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date' }) startDate: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date' }) endDate: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) budgetPerDayPaise: number | null;
  @ApiProperty() areaLabel: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'From the searcher, rounded to 0.5 km (null on your own requests)',
  })
  distanceKm: number | null;
  @ApiProperty({ type: ParticipantDto }) borrower: ParticipantDto;
  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'EXPIRED', 'REMOVED'] }) status: string;
  @ApiProperty() responseCount: number;
  @ApiProperty({ description: 'Whether you (as a lender) already answered it' })
  answeredByMe: boolean;
  @ApiProperty() mine: boolean;
  @ApiProperty() expiresAt: Date;
  @ApiProperty() createdAt: Date;
}

export class ItemRequestDetailDto extends ItemRequestDto {
  @ApiProperty({
    type: [RequestResponseDto],
    description: 'Every answer for your own request; only your own answers otherwise',
  })
  responses: RequestResponseDto[];
}

export class ItemRequestPageDto {
  @ApiProperty({ type: [ItemRequestDto], description: 'Nearest first' }) items: ItemRequestDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor: string | null;
}

// ── Admin ──

export const REQUEST_STATUSES = ['OPEN', 'CLOSED', 'EXPIRED', 'REMOVED'] as const;

export class AdminListRequestsQueryDto {
  @ApiPropertyOptional({ enum: REQUEST_STATUSES })
  @IsOptional()
  @IsString()
  status?: (typeof REQUEST_STATUSES)[number];

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() cursor?: string;

  @ApiPropertyOptional({ default: 30, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 30;
}

export class AdminItemRequestDto extends ItemRequestDetailDto {
  @ApiPropertyOptional({ type: String, nullable: true }) removedReason: string | null;
  @ApiProperty({ description: 'Open reports about this request' }) openReports: number;
}

export class AdminItemRequestPageDto {
  @ApiProperty({ type: [AdminItemRequestDto], description: 'Newest first' })
  items: AdminItemRequestDto[];
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) nextCursor: string | null;
}

export class RemoveRequestDto {
  @ApiProperty({ example: 'Asks for something not allowed on Sajha' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}
