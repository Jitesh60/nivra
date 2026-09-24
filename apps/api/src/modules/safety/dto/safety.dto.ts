import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const REPORT_TARGETS = ['USER', 'LISTING', 'MESSAGE'] as const;
export const REPORT_REASONS = [
  'SPAM',
  'SCAM',
  'OFF_PLATFORM_PAYMENT',
  'INAPPROPRIATE',
  'OTHER',
] as const;
export const REPORT_STATUSES = ['OPEN', 'ACTIONED', 'DISMISSED'] as const;

/** A person as others see them in chat, blocks and reports. */
export class ParticipantDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiPropertyOptional({ type: String, nullable: true }) name: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl: string | null;
  @ApiProperty() idVerified: boolean;
}

export class BlockedUserDto {
  @ApiProperty({ type: ParticipantDto }) user: ParticipantDto;
  @ApiProperty() blockedAt: Date;
}

export class CreateReportDto {
  @ApiProperty({ enum: REPORT_TARGETS })
  @IsIn(REPORT_TARGETS)
  targetType: (typeof REPORT_TARGETS)[number];

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId: string;

  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS)
  reason: (typeof REPORT_REASONS)[number];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The chat it came from, for context' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class ReportCreatedDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: REPORT_STATUSES }) status: string;
}

// ─── Admin ────────────────────────────────────────────────────────────────

export class ListReportsQueryDto {
  @ApiPropertyOptional({ enum: REPORT_STATUSES, default: 'OPEN' })
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status: (typeof REPORT_STATUSES)[number] = 'OPEN';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}

export class ReportTargetDto {
  @ApiProperty({ enum: REPORT_TARGETS }) type: string;
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ description: 'A short description: a name, a listing title or the message text' })
  label: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'User or listing status' })
  status: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'For messages: what the sender typed (admins only)',
  })
  originalText: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Who wrote it / owns it',
  })
  ownerId: string | null;
}

export class AdminReportDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: REPORT_STATUSES }) status: string;
  @ApiProperty({ enum: REPORT_REASONS }) reason: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note: string | null;
  @ApiProperty({ type: ParticipantDto }) reporter: ParticipantDto;
  @ApiProperty({ type: ReportTargetDto }) target: ReportTargetDto;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  conversationId: string | null;
  @ApiProperty({ description: 'Open reports about the same target, this one included' })
  openReportsOnTarget: number;
  @ApiPropertyOptional({ type: String, nullable: true }) resolutionNote: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) resolvedById:
    string | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) resolvedAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class AdminReportPageDto {
  @ApiProperty({ type: [AdminReportDto] }) items: AdminReportDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor: string | null;
}

export class ResolveReportDto {
  @ApiProperty({ enum: ['ACTIONED', 'DISMISSED'] })
  @IsIn(['ACTIONED', 'DISMISSED'])
  outcome: 'ACTIONED' | 'DISMISSED';

  @ApiProperty({ minLength: 3, maxLength: 1000, description: 'What was done, for the record' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note: string;
}

export class TranscriptQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Messages older than this one' })
  @IsOptional()
  @IsUUID()
  before?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}

export class AdminMessageDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) senderId: string;
  @ApiProperty({ enum: ['TEXT', 'IMAGE', 'OFFER', 'SYSTEM'] }) type: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'What the sender typed' })
  body: string | null;
  @ApiProperty({ description: 'Contact details were hidden from the other person' })
  masked: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) imageUrl: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Offers: "12 Oct – 16 Oct 2026 · ₹120/day · ACCEPTED"',
  })
  offerSummary: string | null;
  @ApiProperty() createdAt: Date;
}

export class AdminTranscriptDto {
  @ApiProperty({ format: 'uuid' }) conversationId: string;
  @ApiProperty() listingTitle: string;
  @ApiProperty({ format: 'uuid' }) listingId: string;
  @ApiProperty({ type: ParticipantDto }) borrower: ParticipantDto;
  @ApiProperty({ type: ParticipantDto }) lender: ParticipantDto;
  @ApiProperty({ type: [AdminMessageDto], description: 'Newest first' })
  messages: AdminMessageDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor: string | null;
}
