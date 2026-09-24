import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Condition photos per person and stage, and evidence per side of a dispute. */
export const MAX_PHOTOS = 6;
/** At least this many photos confirm a handover or a return. */
export const MIN_CONFIRM_PHOTOS = 2;

export const RENTAL_STAGES = ['HANDOVER', 'RETURN'] as const;
export const DISPUTE_REASONS = ['DAMAGE', 'MISSING_PARTS', 'NOT_RETURNED', 'OTHER'] as const;

// ── Requests ──

export class ConfirmStageDto {
  @ApiProperty({ example: '482913', description: 'The 6-digit code the other person shows' })
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;

  @ApiProperty({
    type: [String],
    minItems: MIN_CONFIRM_PHOTOS,
    maxItems: MAX_PHOTOS,
    description: 'Upload keys (purpose CONDITION_PHOTO) of the item’s condition now',
  })
  @IsArray()
  @ArrayMaxSize(MAX_PHOTOS)
  @IsString({ each: true })
  photoKeys: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AddPhotosDto {
  @ApiProperty({ enum: RENTAL_STAGES })
  @IsIn(RENTAL_STAGES)
  stage: (typeof RENTAL_STAGES)[number];

  @ApiProperty({ type: [String], minItems: 1, maxItems: MAX_PHOTOS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PHOTOS)
  @IsString({ each: true })
  photoKeys: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class OpenDisputeDto {
  @ApiProperty({ enum: DISPUTE_REASONS })
  @IsIn(DISPUTE_REASONS)
  reason: (typeof DISPUTE_REASONS)[number];

  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description: string;

  @ApiProperty({ description: 'How much of the deposit you ask to keep, in paise' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  claimPaise: number;

  @ApiProperty({
    type: [String],
    maxItems: MAX_PHOTOS,
    description: 'Upload keys (CONDITION_PHOTO)',
  })
  @IsArray()
  @ArrayMaxSize(MAX_PHOTOS)
  @IsString({ each: true })
  photoKeys: string[];
}

export class DisputeResponseDto {
  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note: string;

  @ApiProperty({ type: [String], maxItems: MAX_PHOTOS })
  @IsArray()
  @ArrayMaxSize(MAX_PHOTOS)
  @IsString({ each: true })
  photoKeys: string[];
}

export class WriteReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class ResolveDisputeDto {
  @ApiProperty({ description: 'Deposit the lender keeps, in paise (0 = all back to the borrower)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  keptPaise: number;

  @ApiProperty({ minLength: 3, maxLength: 1000, description: 'Shown to both people' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note: string;
}

export class AdminDisputesQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'RESOLVED'], default: 'OPEN' })
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED'])
  status: 'OPEN' | 'RESOLVED' = 'OPEN';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}

export class ReviewsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

// ── Responses ──

export class BookingCodeDto {
  @ApiProperty({ enum: RENTAL_STAGES, description: 'HANDOVER (borrower shows) or RETURN (lender)' })
  stage: string;
  @ApiProperty({ example: '482913' }) code: string;
  @ApiProperty({ example: 'sajha://booking/…/HANDOVER/482913', description: 'Put this in the QR' })
  qr: string;
}

export class PhotoDto {
  @ApiProperty({ description: 'Short-lived link (10 minutes)' }) url: string;
  @ApiProperty() thumbUrl: string;
}

export class ConditionReportDto {
  @ApiProperty({ enum: RENTAL_STAGES }) stage: string;
  @ApiProperty({ enum: ['BORROWER', 'LENDER'] }) by: string;
  @ApiProperty({ type: [PhotoDto] }) photos: PhotoDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) note: string | null;
  @ApiProperty() at: Date;
}

export class RentalDto {
  @ApiPropertyOptional({ type: Date, nullable: true }) handedOverAt: Date | null;
  @ApiProperty({ description: 'Due back by (midnight IST after the last day)' }) dueAt: Date;
  @ApiPropertyOptional({ type: Date, nullable: true }) returnedAt: Date | null;
  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description: 'The lender can report a problem until then',
  })
  claimUntil: Date | null;
  @ApiProperty({ description: 'Days late (so far, while still out)' }) lateDays: number;
  @ApiProperty({ description: 'Late fee from the deposit (so far, while still out)' })
  lateFeePaise: number;
  @ApiProperty({ description: 'Deposit the lender kept (late fee plus any dispute award)' })
  keptPaise: number;
  @ApiPropertyOptional({ type: Date, nullable: true }) completedAt: Date | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) noShowAt: Date | null;
}

export class DisputeDto {
  @ApiProperty({ enum: DISPUTE_REASONS }) reason: string;
  @ApiProperty() description: string;
  @ApiProperty() claimPaise: number;
  @ApiProperty({ type: [PhotoDto] }) evidence: PhotoDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) responseNote: string | null;
  @ApiProperty({ type: [PhotoDto] }) responsePhotos: PhotoDto[];
  @ApiPropertyOptional({ type: Date, nullable: true }) respondedAt: Date | null;
  @ApiProperty({ enum: ['OPEN', 'RESOLVED'] }) status: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) keptPaise: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) resolutionNote: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) resolvedAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class ReviewDto {
  @ApiProperty() rating: number;
  @ApiPropertyOptional({ type: String, nullable: true }) comment: string | null;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description: 'Null while hidden (until both have reviewed, or 7 days)',
  })
  publishedAt: Date | null;
}

export class BookingReviewsDto {
  @ApiPropertyOptional({ type: ReviewDto, nullable: true, description: 'Yours' })
  mine: ReviewDto | null;
  @ApiPropertyOptional({
    type: ReviewDto,
    nullable: true,
    description: 'The other person’s, once published',
  })
  theirs: ReviewDto | null;
  @ApiPropertyOptional({ type: Date, nullable: true, description: 'You can review until then' })
  reviewUntil: Date | null;
}

export class PublicReviewDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() rating: number;
  @ApiPropertyOptional({ type: String, nullable: true }) comment: string | null;
  @ApiProperty({ enum: ['BORROWER', 'LENDER'], description: 'The author’s side' })
  authorRole: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'First name' })
  authorName: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) authorAvatarUrl: string | null;
  @ApiProperty({ description: 'Rented item' }) listingTitle: string;
  @ApiProperty() publishedAt: Date;
}

export class ReviewPageDto {
  @ApiPropertyOptional({ type: Number, nullable: true }) ratingAvg: number | null;
  @ApiProperty() ratingCount: number;
  @ApiProperty({ type: [PublicReviewDto] }) items: PublicReviewDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor: string | null;
}

// ── Admin ──

export class AdminDisputeDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) bookingId: string;
  @ApiProperty() listingTitle: string;
  @ApiPropertyOptional({ type: String, nullable: true }) borrowerName: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lenderName: string | null;
  @ApiProperty({ enum: DISPUTE_REASONS }) reason: string;
  @ApiProperty() claimPaise: number;
  @ApiProperty() depositPaise: number;
  @ApiProperty({ enum: ['OPEN', 'RESOLVED'] }) status: string;
  @ApiProperty({ description: 'The borrower has replied' }) responded: boolean;
  @ApiProperty() createdAt: Date;
}

export class AdminDisputePageDto {
  @ApiProperty({ type: [AdminDisputeDto] }) items: AdminDisputeDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor: string | null;
}

export class AdminConditionReportDto extends ConditionReportDto {
  @ApiPropertyOptional({ type: String, nullable: true }) byName: string | null;
}

export class AdminDisputeDetailDto extends AdminDisputeDto {
  @ApiProperty() description: string;
  @ApiProperty({ type: [PhotoDto] }) evidence: PhotoDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) responseNote: string | null;
  @ApiProperty({ type: [PhotoDto] }) responsePhotos: PhotoDto[];
  @ApiPropertyOptional({ type: Date, nullable: true }) respondedAt: Date | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) keptPaise: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) resolutionNote: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) resolvedByName: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) resolvedAt: Date | null;
  @ApiProperty({ format: 'uuid' }) conversationId: string;
  @ApiProperty({ type: RentalDto }) rental: RentalDto;
  @ApiProperty({ description: 'Most the lender can be awarded (deposit less the late fee)' })
  maxKeepPaise: number;
  @ApiProperty({ type: [AdminConditionReportDto] }) conditionReports: AdminConditionReportDto[];
}
