import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { MeController } from './me.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [MeController],
  providers: [UsersService],
})
export class UsersModule {}
