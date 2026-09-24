/** Sends one-time codes by SMS. Swap implementations with SMS_PROVIDER. */
export abstract class SmsProvider {
  /** @param phone E.164 number, e.g. +919876543210 */
  abstract sendOtp(phone: string, code: string): Promise<void>;
}
