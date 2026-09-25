import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class NotificationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'booking.requested' }) type: string;
  @ApiProperty() title: string;
  @ApiProperty() body: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Open this booking when tapped',
  })
  bookingId: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Open this listing when tapped (saved-search alerts)',
  })
  listingId: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Open this request when tapped (requests board)',
  })
  requestId: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) readAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto], description: 'Newest first' }) items: NotificationDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor: string | null;
  @ApiProperty({ description: 'Unread notifications in total' }) unread: number;
}

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 30;
}

export class MarkNotificationsReadDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Everything up to and including this one; omit to mark all read',
  })
  @IsOptional()
  @IsUUID()
  upTo?: string;
}
