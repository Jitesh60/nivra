import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { UserDocument } from '../../../generated/prisma/client.js';

export const DOCUMENT_TYPES = [
  'AADHAAR_MASKED',
  'PAN',
  'DRIVING_LICENCE',
  'PASSPORT',
  'VOTER_ID',
  'COLLEGE_ID',
  'EMPLOYEE_ID',
  'ADDRESS_PROOF',
  'OTHER',
] as const;
export type DocumentTypeName = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export class DocumentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: DOCUMENT_TYPES }) type: string;
  @ApiPropertyOptional({ type: String, nullable: true }) label: string | null;
  @ApiProperty({ enum: DOCUMENT_STATUSES }) status: string;
  @ApiPropertyOptional({ type: String, nullable: true }) rejectionReason: string | null;
  @ApiProperty({ description: 'Whether a back side was uploaded' }) hasBack: boolean;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true }) expiresOn: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) reviewedAt:
    string | null;

  static from(d: UserDocument): DocumentDto {
    return {
      id: d.id,
      type: d.type,
      label: d.label,
      status: d.status,
      rejectionReason: d.rejectionReason,
      hasBack: d.backKey !== null,
      expiresOn: d.expiresOn?.toISOString().slice(0, 10) ?? null,
      createdAt: d.createdAt.toISOString(),
      reviewedAt: d.reviewedAt?.toISOString() ?? null,
    };
  }
}

export class CreateDocumentDto {
  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsIn(DOCUMENT_TYPES)
  type: DocumentTypeName;

  @ApiPropertyOptional({
    description: 'Required when type is OTHER',
    example: 'Gym membership card',
  })
  @ValidateIf((o: CreateDocumentDto) => o.type === 'OTHER' || o.label !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 60)
  label?: string;

  @ApiProperty({ description: '`key` from POST /v1/uploads (purpose DOCUMENT) for the front side' })
  @IsString()
  @MaxLength(200)
  frontKey: string;

  @ApiPropertyOptional({ description: 'Upload key for the back side, if the document has one' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  backKey?: string;

  @ApiPropertyOptional({ type: String, format: 'date', example: '2031-06-30' })
  @IsOptional()
  @IsDateString({ strict: true })
  expiresOn?: string;
}

export class DocumentSideQueryDto {
  @ApiPropertyOptional({ enum: ['front', 'back'], default: 'front' })
  @IsOptional()
  @IsIn(['front', 'back'])
  side: 'front' | 'back' = 'front';
}

export class DocumentViewDto {
  @ApiProperty({ description: 'Short-lived URL to the image' }) url: string;
  @ApiProperty({ example: 300 }) expiresInSec: number;
}

export class DocumentUserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiPropertyOptional({ type: String, nullable: true }) name: string | null;
  @ApiProperty() phone: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email: string | null;
}

export class AdminDocumentDto extends DocumentDto {
  @ApiProperty({ type: DocumentUserDto }) user: DocumentUserDto;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Admin who reviewed it' })
  reviewedBy: string | null;
}

export class AdminDocumentPageDto {
  @ApiProperty({ type: [AdminDocumentDto] }) items: AdminDocumentDto[];
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) nextCursor: string | null;
}

export class ListDocumentsQueryDto {
  @ApiPropertyOptional({ enum: DOCUMENT_STATUSES, default: 'PENDING' })
  @IsOptional()
  @IsIn(DOCUMENT_STATUSES)
  status: (typeof DOCUMENT_STATUSES)[number] = 'PENDING';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}

export class RejectDocumentDto {
  @ApiProperty({ example: 'The photo is blurry. Please upload a clearer one.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 300)
  reason: string;
}
