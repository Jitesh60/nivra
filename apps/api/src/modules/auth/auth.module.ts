import { Module } from '@nestjs/common';
import { OtpModule } from '../otp/otp.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { OptionalJwtGuard } from './optional-jwt.guard.js';
import { VerifiedGuard } from './verified.guard.js';

@Module({
  imports: [OtpModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OptionalJwtGuard, VerifiedGuard],
  exports: [JwtAuthGuard, OptionalJwtGuard, VerifiedGuard],
})
export class AuthModule {}
