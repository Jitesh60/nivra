import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AdminWaitlistController, WaitlistController } from './waitlist.controller.js';
import { WaitlistService } from './waitlist.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [WaitlistController, AdminWaitlistController],
  providers: [WaitlistService],
})
export class WaitlistModule {}
