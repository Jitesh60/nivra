import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CategoryDto } from '../../categories/dto/category.dto.js';
import { LISTING_RULES as R } from '../listing-rules.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const ITEM_CONDITIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'] as const;
export const LISTING_STATUSES = [
  'DRAFT',
  'PENDING',
  'LIVE',
  'PAUSED',
  'REJECTED',
  'REMOVED',
  'DELETED',
] as const;
export const REQUIRED_DOC_TYPES = [
  'GOVERNMENT_ID',
  'COLLEGE_OR_EMPLOYEE_ID',
  'ADDRESS_PROOF',
  'OTHER',
] as const;

// ── Input ──

export class CreateListingDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() categoryId: string;

  @ApiProperty({ example: 'Quechua 2-person trekking tent' })
  @Transform(trim)
  @IsString()
  @Length(5, 80)
  title: string;

  @ApiProperty({ example: 'Waterproof, used on 3 treks. Comes with pegs and a carry bag.' })
  @Transform(trim)
  @IsString()
  @Length(20, 2000)
  description: string;

  @ApiProperty({ enum: ITEM_CONDITIONS }) @IsIn(ITEM_CONDITIONS) condition: string;

  @ApiPropertyOptional({ example: 'Decathlon' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  brand?: string;

  @ApiPropertyOptional({ example: 'UK 9', description: 'Size, if it matters (shoes, clothes)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  size?: string;

  @ApiProperty({ example: 15000, description: 'Rent per day in paise (₹10–₹10,000)' })
  @IsInt()
  @Min(R.pricePerDayPaise.min)
  @Max(R.pricePerDayPaise.max)
  pricePerDayPaise: number;

  @ApiPropertyOptional({ example: 10, description: 'Discount % for rentals of 7+ days (0–50)' })
  @IsOptional()
  @IsInt()
  @Min(R.weeklyDiscountPct.min)
  @Max(R.weeklyDiscountPct.max)
  weeklyDiscountPct?: number;

  @ApiProperty({ example: 100000, description: 'Refundable deposit in paise (₹0–₹50,000)' })
  @IsInt()
  @Min(R.depositPaise.min)
  @Max(R.depositPaise.max)
  depositPaise: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(R.rentalDays.min)
  @Max(R.rentalDays.max)
  minDays?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(R.rentalDays.min)
  @Max(R.rentalDays.max)
  maxDays?: number;

  @ApiPropertyOptional({ example: 1, description: 'Days of notice before a rental can start' })
  @IsOptional()
  @IsInt()
  @Min(R.advanceNoticeDays.min)
  @Max(R.advanceNoticeDays.max)
  advanceNoticeDays?: number;

  @ApiPropertyOptional({ example: 18.5074, description: 'Exact pickup point (never public)' })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 73.8077 })
  @ValidateIf((o: CreateListingDto) => o.lat !== undefined || o.lng !== undefined)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 'Kothrud, Pune', description: 'Shown publicly' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  areaLabel?: string;

  @ApiPropertyOptional({
    example: 'Flat 4B, Sai Residency, Paud Road',
    description:
      'Encrypted; shared with a borrower only after a confirmed booking. Empty string clears it.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  exactAddress?: string;
}

export class UpdateListingDto extends PartialType(CreateListingDto) {}

export class AddPhotoDto {
  @ApiProperty({ description: '`key` from POST /v1/uploads (purpose LISTING_PHOTO)' })
  @IsString()
  @MaxLength(200)
  key: string;
}

export class PhotoOrderDto {
  @ApiProperty({ type: [String], description: 'Every photo id, cover first' })
  @IsArray()
  @ArrayMaxSize(R.photos.max)
  @IsUUID('all', { each: true })
  ids: string[];
}

export class BlockRangeDto {
  @ApiProperty({ example: '2026-10-02', format: 'date' })
  @IsDateString({ strict: true })
  startsOn: string;

  @ApiProperty({ example: '2026-10-05', format: 'date', description: 'Inclusive' })
  @IsDateString({ strict: true })
  endsOn: string;
}

export class BlocksDto {
  @ApiProperty({ type: [BlockRangeDto] })
  @IsArray()
  @ArrayMaxSize(R.blocks.maxRanges)
  @ValidateNested({ each: true })
  @Type(() => BlockRangeDto)
  ranges: BlockRangeDto[];
}

export class RequiredDocInputDto {
  @ApiProperty({ enum: REQUIRED_DOC_TYPES }) @IsIn(REQUIRED_DOC_TYPES) docType: string;

  @ApiPropertyOptional({ example: 'Trek permit', description: 'Required for OTHER' })
  @ValidateIf((o: RequiredDocInputDto) => o.docType === 'OTHER' || o.note !== undefined)
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  note?: string;
}

export class RequiredDocsDto {
  @ApiProperty({ type: [RequiredDocInputDto] })
  @IsArray()
  @ArrayMaxSize(REQUIRED_DOC_TYPES.length)
  @ValidateNested({ each: true })
  @Type(() => RequiredDocInputDto)
  items: RequiredDocInputDto[];
}

export class ListingReasonDto {
  @ApiProperty({ example: 'Photos show a different item than the title.' })
  @Transform(trim)
  @IsString()
  @Length(3, 300)
  reason: string;
}

export class ChangeCategoryDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() categoryId: string;
}

export class ListListingsQueryDto {
  @ApiPropertyOptional({ enum: LISTING_STATUSES, default: 'PENDING' })
  @IsOptional()
  @IsIn(LISTING_STATUSES)
  status: (typeof LISTING_STATUSES)[number] = 'PENDING';

  @ApiPropertyOptional({ description: 'Title, or the lender’s phone or name' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() cursor?: string;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}

// ── Output ──

export class ListingPhotoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ description: 'Gallery size (≤1600 px WebP)' }) url: string;
  @ApiProperty({ description: 'Card size (≤480 px WebP)' }) thumbUrl: string;
  @ApiProperty() width: number;
  @ApiProperty() height: number;
}

export class RequiredDocDto {
  @ApiProperty({ enum: REQUIRED_DOC_TYPES }) docType: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note: string | null;
}

export class BlockDto {
  @ApiProperty({ format: 'date' }) startsOn: string;
  @ApiProperty({ format: 'date' }) endsOn: string;
}

/** Fields every view of a listing shares. */
export class ListingBaseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: CategoryDto }) category: CategoryDto;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty({ enum: ITEM_CONDITIONS }) condition: string;
  @ApiPropertyOptional({ type: String, nullable: true }) brand: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) size: string | null;
  @ApiProperty() pricePerDayPaise: number;
  @ApiProperty() weeklyDiscountPct: number;
  @ApiProperty() depositPaise: number;
  @ApiProperty() minDays: number;
  @ApiProperty() maxDays: number;
  @ApiProperty() advanceNoticeDays: number;
  @ApiPropertyOptional({ type: String, nullable: true }) areaLabel: string | null;
  @ApiProperty({ type: [ListingPhotoDto], description: 'Cover first' }) photos: ListingPhotoDto[];
  @ApiProperty({ type: [RequiredDocDto] }) requiredDocs: RequiredDocDto[];
  @ApiProperty({ type: [BlockDto], description: 'Upcoming blocked dates' }) blocks: BlockDto[];
}

/** The lender's own view: the exact pin and address included. */
export class MyListingDto extends ListingBaseDto {
  @ApiProperty({ enum: LISTING_STATUSES }) status: string;
  @ApiPropertyOptional({ type: String, nullable: true }) rejectionReason: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) lat: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) lng: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) exactAddress: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  publishedAt: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: string;
}

export class PublishResultDto {
  @ApiProperty({ type: MyListingDto }) listing: MyListingDto;
  @ApiProperty({ description: 'True when it waits for review (a lender’s first listing)' })
  inReview: boolean;
}

export class LenderSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiPropertyOptional({ type: String, nullable: true }) name: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) city: string | null;
  @ApiProperty() phoneVerified: boolean;
  @ApiProperty() emailVerified: boolean;
  @ApiProperty() idVerified: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) memberSince: string;
}

/** What anyone can see of a LIVE listing: no exact pin or address. */
export class PublicListingDto extends ListingBaseDto {
  @ApiProperty({ description: 'Rounded to ~1 km' }) approxLat: number;
  @ApiProperty({ description: 'Rounded to ~1 km' }) approxLng: number;
  @ApiProperty({ type: LenderSummaryDto }) lender: LenderSummaryDto;
  @ApiProperty({ description: 'In the signed-in user’s wishlist' }) saved: boolean;
  @ApiProperty({ description: 'How many people saved it' }) favoriteCount: number;
}

export class AdminLenderDto extends LenderSummaryDto {
  @ApiProperty() phone: string;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED'] }) status: string;
  @ApiProperty({ description: 'The lender has never had a listing approved' })
  firstListing: boolean;
}

export class AdminListingDto extends ListingBaseDto {
  @ApiProperty({ enum: LISTING_STATUSES }) status: string;
  @ApiPropertyOptional({ type: String, nullable: true }) rejectionReason: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Rounded to ~1 km' })
  approxLat: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Rounded to ~1 km' })
  approxLng: number | null;
  @ApiProperty({ type: AdminLenderDto }) lender: AdminLenderDto;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Admin who last reviewed it' })
  reviewedBy: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  reviewedAt: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  publishedAt: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: string;
}

export class AdminListingPageDto {
  @ApiProperty({ type: [AdminListingDto] }) items: AdminListingDto[];
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) nextCursor: string | null;
}

export class ListingLimitDto {
  @ApiProperty() min: number;
  @ApiProperty() max: number;
}

export class AppConfigDto {
  @ApiProperty({ example: 1000, description: 'Platform commission on rent, basis points' })
  commissionBps: number;
  @ApiProperty({ type: ListingLimitDto }) pricePerDayPaise: ListingLimitDto;
  @ApiProperty({ type: ListingLimitDto }) depositPaise: ListingLimitDto;
  @ApiProperty({ type: ListingLimitDto }) weeklyDiscountPct: ListingLimitDto;
  @ApiProperty({ type: ListingLimitDto }) rentalDays: ListingLimitDto;
  @ApiProperty({ type: ListingLimitDto }) advanceNoticeDays: ListingLimitDto;
  @ApiProperty({ type: ListingLimitDto }) photos: ListingLimitDto;
  @ApiProperty({ example: 50 }) maxBlockedRanges: number;
}
