import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { Session } from '../../../generated/prisma/client.js';

const collapse = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Rahul Sharma' })
  @IsOptional()
  @Transform(collapse)
  @IsString()
  @Length(2, 80)
  name?: string;

  @ApiPropertyOptional({ example: 'Pune', description: 'Empty string clears it' })
  @IsOptional()
  @Transform(collapse)
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({
    example: 'Weekend trekker, happy to lend my camera.',
    description: 'Empty string clears it',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300)
  bio?: string;
}

export class SetAvatarDto {
  @ApiProperty({ description: '`key` from POST /v1/uploads (purpose AVATAR)' })
  @IsString()
  @MaxLength(200)
  key: string;
}

export class SessionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'Pixel 8' }) deviceName:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'android' }) platform:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, format: 'date-time' }) lastUsedAt: string;
  @ApiProperty({ description: 'The session making this request' }) current: boolean;

  static from(session: Session, currentSessionId: string): SessionDto {
    return {
      id: session.id,
      deviceName: session.deviceName,
      platform: session.platform,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      current: session.id === currentSessionId,
    };
  }
}
