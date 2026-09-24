import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { User } from '../../../generated/prisma/client.js';

export class UserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: '+919876543210' }) phone: string;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'rahul@example.com' })
  email: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'Rahul Sharma' })
  name: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED'] }) status: string;
  @ApiProperty() phoneVerified: boolean;
  @ApiProperty() emailVerified: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;

  static from(user: User): UserDto {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      status: user.status,
      phoneVerified: user.phoneVerifiedAt !== null,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
