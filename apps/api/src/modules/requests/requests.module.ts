import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { DiscoveryQueueModule } from '../discovery/discovery-queue.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { SearchModule } from '../search/search.module.js';
import { AdminRequestsController, RequestsController } from './requests.controller.js';
import { RequestsService } from './requests.service.js';

@Module({
  imports: [
    AuthModule,
    AdminAuthModule,
    CategoriesModule,
    ChatModule,
    DiscoveryQueueModule,
    NotificationsModule,
    SafetyModule,
    SearchModule,
  ],
  controllers: [RequestsController, AdminRequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
