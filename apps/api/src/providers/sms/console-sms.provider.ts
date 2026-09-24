import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from './sms.provider.js';

/**
 * Development only (refused in staging/production by env validation):
 * prints the code to the API log instead of sending an SMS.
 */
@Injectable()
export class ConsoleSmsProvider extends SmsProvider {
  private readonly logger = new Logger('SMS');

  async sendOtp(phone: string, code: string): Promise<void> {
    this.logger.warn(`[dev] OTP for ${phone}: ${code}`);
  }
}
