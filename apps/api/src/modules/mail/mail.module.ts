import { Global, Module } from '@nestjs/common';
import { MailWorker } from './mail-worker.js';
import { Mailer } from './mailer.service.js';

@Global()
@Module({
  providers: [Mailer, MailWorker],
  exports: [Mailer],
})
export class MailModule {}
