import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { EmailProvider } from './email.provider.js';
import { ResendEmailProvider } from './resend-email.provider.js';
import { SmtpEmailProvider } from './smtp-email.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: EmailProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): EmailProvider => {
        const from = config.get('EMAIL_FROM', { infer: true });
        return config.get('EMAIL_PROVIDER', { infer: true }) === 'resend'
          ? new ResendEmailProvider(config.get('RESEND_API_KEY', { infer: true })!, from)
          : new SmtpEmailProvider(from, {
              host: config.get('SMTP_HOST', { infer: true }),
              port: config.get('SMTP_PORT', { infer: true }),
            });
      },
    },
  ],
  exports: [EmailProvider],
})
export class EmailModule {}
