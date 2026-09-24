import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UserView } from '../user-view.js';

export class UserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: '+919876543210' }) phone: string;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'rahul@example.com' })
  email: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'Rahul Sharma' })
  name: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'Pune' })
  city: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Weekend trekker, happy to lend my camera.',
  })
  bio: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Public URL of the 512×512 avatar',
  })
  avatarUrl: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED'] }) status: string;
  @ApiProperty() phoneVerified: boolean;
  @ApiProperty() emailVerified: boolean;
  @ApiProperty({ description: 'Has at least one admin-approved, unexpired document' })
  idVerified: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;

  /** `avatarUrl` turns a stored key into a public URL (StorageService.publicUrl). */
  static from(user: UserView, avatarUrl: (key: string) => string): UserDto {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      city: user.profile?.city ?? null,
      bio: user.profile?.bio ?? null,
      avatarUrl: user.profile?.avatarKey ? avatarUrl(user.profile.avatarKey) : null,
      status: user.status,
      phoneVerified: user.phoneVerifiedAt !== null,
      emailVerified: user.emailVerifiedAt !== null,
      idVerified: user._count.documents > 0,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
