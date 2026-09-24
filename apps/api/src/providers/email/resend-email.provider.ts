import { Injectable } from '@nestjs/common';
import { EmailProvider, type EmailMessage } from './email.provider.js';

/** Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
@Injectable()
export class ResendEmailProvider extends EmailProvider {
  static readonly url = 'https://api.resend.com/emails';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    super();
  }

  async send(message: EmailMessage): Promise<void> {
    const res = await this.fetchFn(ResendEmailProvider.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, ...message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Resend send failed (${res.status}): ${await res.text().catch(() => '')}`);
    }
  }
}
