import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { loggerConfig } from './common/logging/logger.config.js';
import { validateEnv, type Env } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
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
    HealthModule,
  ],
})
export class AppModule {}
