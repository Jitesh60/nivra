import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { EmailProvider, type EmailMessage } from './email.provider.js';

/** Plain SMTP. Used with Mailpit locally (all mail is caught at http://localhost:8025). */
@Injectable()
export class SmtpEmailProvider extends EmailProvider implements OnModuleDestroy {
  private readonly transport: Transporter;

  constructor(
    private readonly from: string,
    options: { host: string; port: number },
  ) {
    super();
    this.transport = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: false,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
