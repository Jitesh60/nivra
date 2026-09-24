import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  DevicesController,
  NotificationPreferencesController,
  NotificationsController,
} from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [AuthModule],
  controllers: [DevicesController, NotificationsController, NotificationPreferencesController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
