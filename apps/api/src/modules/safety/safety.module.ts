import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BlocksService } from './blocks.service.js';
import { ParticipantPresenter } from './participants.js';
import { ReportsService } from './reports.service.js';
import { AdminSafetyController, SafetyController } from './safety.controller.js';
import { TranscriptsService } from './transcripts.service.js';

@Module({
  imports: [AuthModule, AdminAuthModule],
  controllers: [SafetyController, AdminSafetyController],
  providers: [BlocksService, ReportsService, TranscriptsService, ParticipantPresenter],
  exports: [BlocksService, ParticipantPresenter],
})
export class SafetyModule {}
