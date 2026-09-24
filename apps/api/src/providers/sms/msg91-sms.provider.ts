import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from './sms.provider.js';

export interface Msg91Options {
  authKey: string;
  templateId: string;
  /** DLT template with `##item##` and `##days##`; overdue SMS are skipped without one. */
  overdueTemplateId?: string;
  fetch?: typeof fetch;
}

/**
 * MSG91 Flow API. The template (registered on DLT) must contain an `##otp##` variable.
 * https://docs.msg91.com/reference/send-sms
 */
@Injectable()
export class Msg91SmsProvider extends SmsProvider {
  static readonly url = 'https://control.msg91.com/api/v5/flow';

  constructor(private readonly options: Msg91Options) {
    super();
  }

  private readonly logger = new Logger('SMS');

  async sendOtp(phone: string, code: string): Promise<void> {
    await this.flow(this.options.templateId, { mobiles: phone.replace(/^\+/, ''), otp: code });
  }

  async sendOverdue(phone: string, item: string, daysLate: number): Promise<void> {
    if (!this.options.overdueTemplateId) {
      this.logger.warn('MSG91_OVERDUE_TEMPLATE_ID is not set; overdue SMS skipped');
      return;
    }
    await this.flow(this.options.overdueTemplateId, {
      mobiles: phone.replace(/^\+/, ''),
      item: item.slice(0, 30),
      days: String(daysLate),
    });
  }

  private async flow(templateId: string, recipient: Record<string, string>): Promise<void> {
    const res = await (this.options.fetch ?? fetch)(Msg91SmsProvider.url, {
      method: 'POST',
      headers: { authkey: this.options.authKey, 'content-type': 'application/json' },
      body: JSON.stringify({ template_id: templateId, short_url: '0', recipients: [recipient] }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || body.type === 'error') {
      throw new Error(`MSG91 send failed (${res.status}): ${body.message ?? 'unknown error'}`);
    }
  }
}
