import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AdminsController, AdminUsersController } from './admin.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminsService } from './admins.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminsController, AdminUsersController],
  providers: [AdminsService, AdminUsersService],
})
export class AdminModule {}
