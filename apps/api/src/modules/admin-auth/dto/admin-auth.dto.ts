import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import type { AdminUser, Session } from '../../../generated/prisma/client.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password.js';

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class AdminDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'ops@sajha.app' }) email: string;
  @ApiProperty({ example: 'Asha Verma' }) name: string;
  @ApiProperty({ enum: ['SUPER_ADMIN', 'OPS', 'SUPPORT'] }) role: string;
  @ApiProperty({ enum: ['ACTIVE', 'DISABLED'] }) status: string;
  @ApiProperty() twoFactorEnabled: boolean;
  @ApiProperty() mustChangePassword: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) lastLoginAt:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;

  static from(a: AdminUser): AdminDto {
    return {
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role,
      status: a.status,
      twoFactorEnabled: a.totpEnabledAt !== null,
      mustChangePassword: a.mustChangePassword,
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }
}

export class AdminLoginDto {
  @ApiProperty({ example: 'ops@sajha.app' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty()
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

export class AdminLoginResponseDto {
  @ApiProperty({ description: 'Short-lived (5 min) token for the 2FA step. Not an access token.' })
  mfaToken: string;

  @ApiProperty({ description: 'True until this admin has set up an authenticator app' })
  mfaSetupRequired: boolean;
}

export class MfaTokenDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2048)
  mfaToken: string;
}

export class TwoFactorSetupDto {
  @ApiProperty({ example: 'otpauth://totp/Sajha%20Admin:ops%40sajha.app?secret=…' })
  otpauthUrl: string;

  @ApiProperty({ description: 'PNG data URL of the QR code to scan' })
  qrDataUrl: string;
}

export class TwoFactorVerifyDto extends MfaTokenDto {
  @ApiPropertyOptional({ example: '123456', description: 'Code from the authenticator app' })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code?: string;

  @ApiPropertyOptional({ example: 'k7rq-2mxp-9tzc', description: 'One-time recovery code' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  recoveryCode?: string;
}

export class AdminTokensDto {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty({ example: 600 }) expiresInSec: number;
}

export class AdminSessionResponseDto extends AdminTokensDto {
  @ApiProperty({ type: AdminDto }) admin: AdminDto;

  @ApiPropertyOptional({
    type: [String],
    description: 'Only returned once, right after 2FA is first enabled. Show them to the admin.',
  })
  recoveryCodes?: string[];
}

export class AdminRefreshDto {
  @ApiProperty()
  @IsString()
  @Length(16, 256)
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  newPassword: string;
}

export class AdminMeDto {
  @ApiProperty({ type: AdminDto }) admin: AdminDto;
}

export class AdminSessionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiPropertyOptional({ type: String, nullable: true }) ip: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) userAgent: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, format: 'date-time' }) lastUsedAt: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt: string;
  @ApiProperty() current: boolean;

  static from(s: Session, currentId: string): AdminSessionDto {
    return {
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: s.id === currentId,
    };
  }
}

export class SessionIdParam {
  @IsUUID()
  id: string;
}
