import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AdminSystemController } from './system.controller.js';
import { SystemService } from './system.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminSystemController],
  providers: [SystemService],
})
export class SystemModule {}
