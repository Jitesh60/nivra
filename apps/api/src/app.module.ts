import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { loggerConfig } from './common/logging/logger.config.js';
import { validateEnv, type Env } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { ListingsModule } from './modules/listings/listings.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { SessionsModule } from './modules/sessions/sessions.module.js';
import { UserViewModule } from './modules/users/user-view.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { WaitlistModule } from './modules/waitlist/waitlist.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { EmailModule } from './providers/email/email.module.js';
import { StorageModule } from './providers/storage/storage.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { SafetyModule } from './modules/safety/safety.module.js';
import { PushModule } from './providers/push/push.module.js';
import { SmsModule } from './providers/sms/sms.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        loggerConfig({
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
        }),
    }),
    PrismaModule,
    RedisModule,
    SmsModule,
    EmailModule,
    PushModule,
    RealtimeModule,
    StorageModule,
    UserViewModule,
    AuditModule,
    SessionsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    MediaModule,
    DocumentsModule,
    CategoriesModule,
    ListingsModule,
    SearchModule,
    AdminAuthModule,
    AdminModule,
    WaitlistModule,
    NotificationsModule,
    SafetyModule,
    ChatModule,
    BookingsModule,
  ],
})
export class AppModule {}
