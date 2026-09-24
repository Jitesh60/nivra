import { SmsProvider } from '../../src/providers/sms/sms.provider.js';

/** Captures SMS codes so tests can read them. */
export class InMemorySmsProvider extends SmsProvider {
  readonly sent: { phone: string; code: string }[] = [];
  fail = false;

  async sendOtp(phone: string, code: string): Promise<void> {
    if (this.fail) throw new Error('SMS gateway down');
    this.sent.push({ phone, code });
  }

  lastCodeFor(phone: string): string {
    const hit = [...this.sent].reverse().find((m) => m.phone === phone);
    if (!hit) throw new Error(`No SMS sent to ${phone}`);
    return hit.code;
  }
}
