import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AdminDto } from '../../admin-auth/dto/admin-auth.dto.js';
import { DocumentDto } from '../../documents/dto/document.dto.js';
import { UserDto } from '../../users/dto/user.dto.js';

const ROLES = ['SUPER_ADMIN', 'OPS', 'SUPPORT'] as const;
const STATUSES = ['ACTIVE', 'DISABLED'] as const;

export class CreateAdminDto {
  @ApiProperty({ example: 'ops@sajha.app' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Asha Verma' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role: (typeof ROLES)[number];
}

export class CreateAdminResponseDto {
  @ApiProperty({ type: AdminDto }) admin: AdminDto;

  @ApiProperty({
    description: 'Shown once. Share it securely; the admin must change it on first login.',
  })
  temporaryPassword: string;
}

export class UpdateAdminDto {
  @ApiPropertyOptional({ example: 'Asha Verma' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: (typeof ROLES)[number];

  @ApiPropertyOptional({ enum: STATUSES, description: 'DISABLED signs the admin out everywhere' })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

export class ListUsersQueryDto {
  @ApiPropertyOptional({ description: 'Matches phone, email or name', example: '98765' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', description: '`nextCursor` from the previous page' })
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

export class UserPageDto {
  @ApiProperty({ type: [UserDto] }) items: UserDto[];
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) nextCursor: string | null;
}

export class UserActionDto {
  @ApiProperty({ example: 'Repeated no-shows reported by three lenders' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 300)
  reason: string;
}

export class ActivityDto {
  @ApiProperty() action: string;
  @ApiProperty({ enum: ['ADMIN', 'USER', 'SYSTEM'] }) actorType: string;
  @ApiPropertyOptional({ type: String, nullable: true }) actorId: string | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) metadata: unknown;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
}

export class AdminUserListingDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: ['DRAFT', 'PENDING', 'LIVE', 'PAUSED', 'REJECTED', 'REMOVED', 'DELETED'] })
  status: string;
  @ApiProperty() pricePerDayPaise: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
}

export class AdminUserDetailDto {
  @ApiProperty({ type: UserDto }) user: UserDto;
  @ApiProperty({ type: [DocumentDto] }) documents: DocumentDto[];
  @ApiProperty({ type: [AdminUserListingDto], description: 'Not deleted, newest first' })
  listings: AdminUserListingDto[];
  @ApiProperty() activeSessions: number;
  @ApiProperty({
    type: [ActivityDto],
    description: 'Latest 50 audit entries by or about this user',
  })
  activity: ActivityDto[];
}
