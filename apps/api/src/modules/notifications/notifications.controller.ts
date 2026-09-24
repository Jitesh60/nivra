import { Body, Controller, Delete, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, JwtAuthGuard, type UserAuth } from '../auth/jwt-auth.guard.js';
import { NotificationsService } from './notifications.service.js';

export class PushTokenDto {
  @ApiProperty({ description: 'FCM registration token' })
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token: string;

  @ApiProperty({ enum: ['android', 'ios'] })
  @IsIn(['android', 'ios'])
  platform: 'android' | 'ios';
}

@ApiTags('me · devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/devices/push-token')
export class DevicesController {
  constructor(private readonly notifications: NotificationsService) {}

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Register this device for push notifications (this session)' })
  @ApiNoContentResponse()
  async register(@CurrentUser() auth: UserAuth, @Body() body: PushTokenDto): Promise<void> {
    await this.notifications.registerToken(auth.userId, auth.sessionId, body.token, body.platform);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop push notifications to this device' })
  @ApiNoContentResponse()
  async remove(@CurrentUser() auth: UserAuth): Promise<void> {
    await this.notifications.removeSessionTokens(auth.sessionId);
  }
}
