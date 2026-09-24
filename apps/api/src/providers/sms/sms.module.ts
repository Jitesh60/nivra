import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { ConsoleSmsProvider } from './console-sms.provider.js';
import { Msg91SmsProvider } from './msg91-sms.provider.js';
import { SmsProvider } from './sms.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: SmsProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): SmsProvider =>
        config.get('SMS_PROVIDER', { infer: true }) === 'msg91'
          ? new Msg91SmsProvider({
              authKey: config.get('MSG91_AUTH_KEY', { infer: true })!,
              templateId: config.get('MSG91_OTP_TEMPLATE_ID', { infer: true })!,
            })
          : new ConsoleSmsProvider(),
    },
  ],
  exports: [SmsProvider],
})
export class SmsModule {}
