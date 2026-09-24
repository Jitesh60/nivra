import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { ConsolePushProvider } from './console-push.provider.js';
import { FcmPushProvider } from './fcm-push.provider.js';
import { PushProvider } from './push.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: PushProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PushProvider => {
        if (config.get('PUSH_PROVIDER', { infer: true }) !== 'fcm')
          return new ConsolePushProvider();
        // Shape checked by env validation.
        const key = JSON.parse(config.get('FCM_SERVICE_ACCOUNT_JSON', { infer: true })!) as {
          client_email: string;
          private_key: string;
        };
        return new FcmPushProvider({
          projectId: config.get('FCM_PROJECT_ID', { infer: true })!,
          clientEmail: key.client_email,
          privateKey: key.private_key,
        });
      },
    },
  ],
  exports: [PushProvider],
})
export class PushModule {}
