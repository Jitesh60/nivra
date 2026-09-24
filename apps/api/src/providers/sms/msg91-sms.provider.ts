import { Injectable } from '@nestjs/common';
import { SmsProvider } from './sms.provider.js';

export interface Msg91Options {
  authKey: string;
  templateId: string;
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

  async sendOtp(phone: string, code: string): Promise<void> {
    const res = await (this.options.fetch ?? fetch)(Msg91SmsProvider.url, {
      method: 'POST',
      headers: { authkey: this.options.authKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        template_id: this.options.templateId,
        short_url: '0',
        recipients: [{ mobiles: phone.replace(/^\+/, ''), otp: code }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || body.type === 'error') {
      throw new Error(`MSG91 send failed (${res.status}): ${body.message ?? 'unknown error'}`);
    }
  }
}
