import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { AdminReferralsController, ReferralsController } from './referrals.controller.js';
import { ReferralsService } from './referrals.service.js';

@Module({
  imports: [AuthModule, AdminAuthModule, BookingsModule, NotificationsModule, SafetyModule],
  controllers: [ReferralsController, AdminReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
