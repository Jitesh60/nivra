import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class NotificationPreferencesDto {
  @ApiProperty({ description: 'Push: requests, payments, handover, return, disputes, refunds' })
  pushBookings: boolean;
  @ApiProperty({ description: 'Push: new chat messages' }) pushChat: boolean;
  @ApiProperty({ description: 'Push: pickup and return reminders' }) pushReminders: boolean;
  @ApiProperty({ description: 'Email: receipts, refunds and dispute outcomes' })
  emailBookings: boolean;
  @ApiProperty({ description: 'SMS: overdue return reminders' }) smsReminders: boolean;
  @ApiProperty({ description: 'News and offers from Sajha' }) marketing: boolean;
}

/** Only the switches sent are changed. */
export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() pushBookings?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() pushChat?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() pushReminders?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() emailBookings?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() smsReminders?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() marketing?: boolean;
}
