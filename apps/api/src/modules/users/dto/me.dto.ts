import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import type { Session } from '../../../generated/prisma/client.js';

export class UpdateMeDto {
  @ApiProperty({ example: 'Rahul Sharma' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString()
  @Length(2, 80)
  name: string;
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
